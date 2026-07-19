<?php
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit(json_encode(['ok' => false, 'error' => 'Method not allowed']));
}

// Honeypot — bots fill the hidden "website" field
if (!empty($_POST['website'])) {
    exit(json_encode(['ok' => true]));
}

function clean(string $s): string {
    return htmlspecialchars(trim($s), ENT_QUOTES, 'UTF-8');
}

$name    = clean($_POST['name']    ?? '');
$email   = trim($_POST['email']    ?? '');
$company = clean($_POST['company'] ?? '');
$role    = clean($_POST['role']    ?? '');
$message = clean($_POST['message'] ?? '');

if (!$name || !$email || !$message) {
    http_response_code(400);
    exit(json_encode(['ok' => false, 'error' => 'Name, email and message are required.']));
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    exit(json_encode(['ok' => false, 'error' => 'Invalid email address.']));
}

$email_safe = clean($email);
$subject    = "[PGResearch] Contact from {$name}";

$body = <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:Georgia,serif;color:#0a0a0a;max-width:600px;margin:0 auto;padding:32px 24px;">
  <div style="border-left:3px solid #0b6f6a;padding-left:16px;margin-bottom:28px;">
    <h2 style="margin:0 0 4px;font-size:20px;">New Contact — PGResearch.org</h2>
    <p style="margin:0;color:#666;font-size:13px;">Forwarded from support@meimonkey.capital</p>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:15px;">
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:10px 0;font-weight:600;width:110px;color:#555;">Name</td>
      <td style="padding:10px 0;">{$name}</td>
    </tr>
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:10px 0;font-weight:600;color:#555;">Email</td>
      <td style="padding:10px 0;"><a href="mailto:{$email_safe}" style="color:#0b6f6a;">{$email_safe}</a></td>
    </tr>
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:10px 0;font-weight:600;color:#555;">Company</td>
      <td style="padding:10px 0;">{$company}</td>
    </tr>
    <tr>
      <td style="padding:10px 0;font-weight:600;color:#555;">Role</td>
      <td style="padding:10px 0;">{$role}</td>
    </tr>
  </table>
  <div style="margin-top:24px;">
    <p style="font-weight:600;color:#555;margin-bottom:8px;">Message</p>
    <div style="background:#f8faf9;padding:16px 20px;border-left:3px solid #0b6f6a;line-height:1.75;">{$message}</div>
  </div>
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#aaa;">
    Submitted via pgresearch.org contact form
  </div>
</body>
</html>
HTML;

// ── Pure-PHP SMTP over SSL port 465 (no STARTTLS needed) ──
$cfg = [
    'host'      => 'mail.gandi.net',
    'port'      => 465,
    'user'      => 'support@meimonkey.capital',
    'pass'      => 'xS2502741143@support',
    'from'      => 'support@meimonkey.capital',
    'from_name' => 'PGResearch Contact',
    'to'        => 'chris@pgresearch.org',
];

try {
    $ctx  = stream_context_create(['ssl' => [
        'verify_peer'       => true,
        'verify_peer_name'  => true,
        'allow_self_signed' => false,
    ]]);
    $sock = stream_socket_client(
        "ssl://{$cfg['host']}:{$cfg['port']}",
        $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx
    );
    if (!$sock) throw new RuntimeException("SMTP connect failed: {$errstr} ({$errno})");
    stream_set_timeout($sock, 15);

    // Helper: read multi-line SMTP response
    $rd = static function () use ($sock): string {
        $buf = '';
        while ($line = fgets($sock, 512)) {
            $buf .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $buf;
    };
    $cmd = static function (string $c) use ($sock, $rd): string {
        fwrite($sock, $c . "\r\n");
        return $rd();
    };

    $rd();                                      // 220 banner
    $cmd("EHLO pgresearch.org");
    $cmd("AUTH LOGIN");
    $cmd(base64_encode($cfg['user']));
    $resp = $cmd(base64_encode($cfg['pass']));
    if (!str_starts_with($resp, '235')) {
        throw new RuntimeException("SMTP auth failed: {$resp}");
    }

    $cmd("MAIL FROM:<{$cfg['from']}>");
    $cmd("RCPT TO:<{$cfg['to']}>");
    $cmd("DATA");

    $mid  = uniqid('pgr', true) . '@pgresearch.org';
    $b64  = chunk_split(base64_encode($body));
    fwrite($sock, implode("\r\n", [
        "Date: "    . date('r'),
        "From: {$cfg['from_name']} <{$cfg['from']}>",
        "To: <{$cfg['to']}>",
        "Reply-To: {$name} <{$email}>",
        "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=",
        "Message-ID: <{$mid}>",
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        $b64,
        ".",
        "",
    ]));
    $rd();
    $cmd("QUIT");
    fclose($sock);

    echo json_encode(['ok' => true]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
