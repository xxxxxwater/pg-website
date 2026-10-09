<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

const ALLOWED_HOSTS = ['pgresearch.org'];
const CHALLENGE_DIFFICULTY = 3;
const CHALLENGE_MIN_AGE = 0;
const CHALLENGE_MAX_AGE = 7200;

function respond(array $payload, int $status = 200): void {
    http_response_code($status);
    exit(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
}

function fail(string $error, string $field = '', int $status = 400): void {
    $payload = ['ok' => false, 'error' => $error];
    if ($field !== '') $payload['field'] = $field;
    respond($payload, $status);
}

function base64url_encode(string $value): string {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode(string $value): string|false {
    $value = strtr($value, '-_', '+/');
    $value .= str_repeat('=', (4 - strlen($value) % 4) % 4);
    return base64_decode($value, true);
}

function load_private_config(): array {
    $candidates = array_filter([
        getenv('PG_CONTACT_CONFIG') ?: '',
        dirname(__DIR__) . '/private/pgresearch-contact-config.php',
        ($_SERVER['HOME'] ?? '') . '/private/pgresearch-contact-config.php',
        dirname(__DIR__, 3) . '/private/pgresearch-contact-config.php',
    ]);

    foreach ($candidates as $path) {
        if (is_readable($path)) {
            $config = require $path;
            if (is_array($config)) return $config;
        }
    }

    return [];
}

function request_source_is_allowed(): bool {
    $source = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
    if ($source === '') return false;
    $host = strtolower((string) parse_url($source, PHP_URL_HOST));
    return in_array($host, ALLOWED_HOSTS, true);
}

function request_ip(): string {
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function rate_directory(): string {
    $dir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'pgresearch-contact-guard';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('Rate-limit storage unavailable');
    }
    return $dir;
}

function enforce_rate_limit(string $bucket, int $limit, int $window): void {
    $path = rate_directory() . DIRECTORY_SEPARATOR . hash('sha256', $bucket) . '.json';
    $handle = fopen($path, 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) throw new RuntimeException('Rate-limit lock unavailable');

    $raw = stream_get_contents($handle);
    $timestamps = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($timestamps)) $timestamps = [];

    $now = time();
    $timestamps = array_values(array_filter($timestamps, static fn($stamp) => is_int($stamp) && $stamp > $now - $window));
    if (count($timestamps) >= $limit) {
        flock($handle, LOCK_UN);
        fclose($handle);
        header('Retry-After: ' . $window);
        fail('Too many messages have been submitted. Please try again later.', '', 429);
    }

    $timestamps[] = $now;
    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($timestamps));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function clean(string $value): string {
    return htmlspecialchars(trim($value), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function plain(string $key): string {
    return trim((string) ($_POST[$key] ?? ''));
}

function text_len(string $value): int {
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function has_text(string $value): bool {
    return preg_match('/[\p{L}\p{N}]/u', $value) === 1;
}

function contains_url(string $value): bool {
    return preg_match('/(?:https?:\/\/|www\.)/i', $value) === 1;
}

function url_count(string $value): int {
    preg_match_all('/(?:https?:\/\/|www\.)/i', $value, $matches);
    return count($matches[0]);
}

function header_text(string $value): string {
    return preg_replace('/[\r\n]+/', ' ', trim($value));
}

function create_challenge(string $secret): void {
    $payload = base64url_encode(json_encode([
        'issued' => time(),
        'nonce' => bin2hex(random_bytes(16)),
    ], JSON_UNESCAPED_SLASHES));
    $signature = base64url_encode(hash_hmac('sha256', $payload, $secret, true));
    respond([
        'ok' => true,
        'token' => $payload . '.' . $signature,
        'difficulty' => CHALLENGE_DIFFICULTY,
    ]);
}

function verify_and_consume_challenge(string $secret): void {
    $token = plain('challenge_token');
    $proof = plain('challenge_proof');
    if ($token === '' || !ctype_digit($proof)) fail('Verification expired. Please try sending again.');

    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) fail('Verification expired. Please try sending again.');
    [$payload, $providedSignature] = $parts;
    $expectedSignature = base64url_encode(hash_hmac('sha256', $payload, $secret, true));
    if (!hash_equals($expectedSignature, $providedSignature)) fail('Verification expired. Please try sending again.');

    $decoded = base64url_decode($payload);
    $data = is_string($decoded) ? json_decode($decoded, true) : null;
    $issued = is_array($data) ? ($data['issued'] ?? 0) : 0;
    $age = time() - (int) $issued;
    if ($age < CHALLENGE_MIN_AGE || $age > CHALLENGE_MAX_AGE) fail('Verification expired. Please try sending again.');

    $digest = hash('sha256', $token . ':' . $proof);
    if (!str_starts_with($digest, str_repeat('0', CHALLENGE_DIFFICULTY))) {
        fail('Verification failed. Please try sending again.');
    }

    $usedPath = rate_directory() . DIRECTORY_SEPARATOR . 'used-' . hash('sha256', $token);
    $handle = @fopen($usedPath, 'x');
    if (!$handle) fail('This form verification has already been used. Please try again.');
    fwrite($handle, (string) time());
    fclose($handle);
}

$private = load_private_config();
$formSecret = (string) ($private['form_secret'] ?? getenv('PG_FORM_SECRET') ?: '');
if ($formSecret === '') {
    error_log('[PGResearch contact] Missing private form secret');
    fail('Contact service is temporarily unavailable.', '', 503);
}

if (!request_source_is_allowed()) fail('Request source could not be verified.', '', 403);

if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['challenge'])) {
    create_challenge($formSecret);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    fail('Method not allowed.', '', 405);
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 32768) fail('Submission is too large.', '', 413);

if (!empty($_POST['website'])) respond(['ok' => true]);

verify_and_consume_challenge($formSecret);

$nameRaw    = plain('name');
$emailRaw   = plain('email');
$companyRaw = plain('company');
$roleRaw    = plain('role');
$messageRaw = plain('message');

if (text_len($nameRaw) < 2 || text_len($nameRaw) > 80 || !has_text($nameRaw) || contains_url($nameRaw)) {
    fail('Name must be 2-80 characters and cannot contain links.', 'name');
}
if (text_len($emailRaw) > 120 || !filter_var($emailRaw, FILTER_VALIDATE_EMAIL)) {
    fail('Please enter a valid email address.', 'email');
}
if (text_len($companyRaw) < 2 || text_len($companyRaw) > 120 || !has_text($companyRaw) || contains_url($companyRaw)) {
    fail('Company / Organization must be 2-120 characters and cannot contain links.', 'company');
}
if (text_len($roleRaw) < 2 || text_len($roleRaw) > 80 || !has_text($roleRaw) || contains_url($roleRaw)) {
    fail('Role / Title must be 2-80 characters and cannot contain links.', 'role');
}
if (text_len($messageRaw) < 20 || text_len($messageRaw) > 2000 || !has_text($messageRaw) || url_count($messageRaw) > 3) {
    fail('Message must be 20-2000 characters and include no more than 3 links.', 'message');
}

try {
    enforce_rate_limit('ip-short:' . request_ip(), 3, 900);
    enforce_rate_limit('ip-day:' . request_ip(), 10, 86400);
    enforce_rate_limit('email-day:' . strtolower($emailRaw), 3, 86400);

    $name = clean($nameRaw);
    $email = $emailRaw;
    $company = clean($companyRaw);
    $role = clean($roleRaw);
    $message = nl2br(clean($messageRaw));
    $emailSafe = clean($email);
    $nameHeader = header_text($nameRaw);
    $subject = "[PGResearch] Contact from {$nameHeader}";

    $body = <<<HTML
<!DOCTYPE html>
<html>
<body style="font-family:Georgia,serif;color:#0a0a0a;max-width:600px;margin:0 auto;padding:32px 24px;">
  <div style="border-left:3px solid #0b6f6a;padding-left:16px;margin-bottom:28px;">
    <h2 style="margin:0 0 4px;font-size:20px;">New Contact — PGResearch.org</h2>
    <p style="margin:0;color:#666;font-size:13px;">Verified website contact submission</p>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:15px;">
    <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;font-weight:600;width:110px;color:#555;">Name</td><td style="padding:10px 0;">{$name}</td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;font-weight:600;color:#555;">Email</td><td style="padding:10px 0;"><a href="mailto:{$emailSafe}" style="color:#0b6f6a;">{$emailSafe}</a></td></tr>
    <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;font-weight:600;color:#555;">Company</td><td style="padding:10px 0;">{$company}</td></tr>
    <tr><td style="padding:10px 0;font-weight:600;color:#555;">Role</td><td style="padding:10px 0;">{$role}</td></tr>
  </table>
  <div style="margin-top:24px;"><p style="font-weight:600;color:#555;margin-bottom:8px;">Message</p><div style="background:#f8faf9;padding:16px 20px;border-left:3px solid #0b6f6a;line-height:1.75;">{$message}</div></div>
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#aaa;">Submitted via pgresearch.org contact form</div>
</body>
</html>
HTML;

    $smtp = $private['smtp'] ?? [];
    $cfg = [
        'host' => (string) ($smtp['host'] ?? getenv('PG_SMTP_HOST') ?: ''),
        'port' => (int) ($smtp['port'] ?? getenv('PG_SMTP_PORT') ?: 465),
        'user' => (string) ($smtp['user'] ?? getenv('PG_SMTP_USER') ?: ''),
        'pass' => (string) ($smtp['pass'] ?? getenv('PG_SMTP_PASS') ?: ''),
        'from' => (string) ($smtp['from'] ?? getenv('PG_SMTP_FROM') ?: ''),
        'from_name' => (string) ($smtp['from_name'] ?? 'PGResearch Contact'),
        'to' => (string) ('chris@puregamma.ai'),
    ];
    if ($cfg['host'] === '' || $cfg['user'] === '' || $cfg['pass'] === '' || $cfg['from'] === '') {
        throw new RuntimeException('SMTP configuration is incomplete');
    }

    $ctx = stream_context_create(['ssl' => [
        'verify_peer' => true,
        'verify_peer_name' => true,
        'allow_self_signed' => false,
    ]]);
    $sock = stream_socket_client(
        "ssl://{$cfg['host']}:{$cfg['port']}",
        $errno,
        $errstr,
        15,
        STREAM_CLIENT_CONNECT,
        $ctx
    );
    if (!$sock) throw new RuntimeException('SMTP connection failed');
    stream_set_timeout($sock, 15);

    $readResponse = static function () use ($sock): string {
        $buffer = '';
        while (($line = fgets($sock, 512)) !== false) {
            $buffer .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        $meta = stream_get_meta_data($sock);
        if ($buffer === '' || !empty($meta['timed_out'])) throw new RuntimeException('SMTP response timeout');
        return $buffer;
    };
    $expect = static function (string $response, array $codes, string $stage): void {
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $codes, true)) throw new RuntimeException("SMTP rejected {$stage}");
    };
    $command = static function (string $value, array $codes, string $stage) use ($sock, $readResponse, $expect): string {
        if (fwrite($sock, $value . "\r\n") === false) throw new RuntimeException("SMTP write failed at {$stage}");
        $response = $readResponse();
        $expect($response, $codes, $stage);
        return $response;
    };

    $expect($readResponse(), [220], 'banner');
    $command('EHLO pgresearch.org', [250], 'EHLO');
    $command('AUTH LOGIN', [334], 'AUTH');
    $command(base64_encode($cfg['user']), [334], 'username');
    $command(base64_encode($cfg['pass']), [235], 'password');
    $command("MAIL FROM:<{$cfg['from']}>", [250], 'MAIL FROM');
    $command("RCPT TO:<{$cfg['to']}>", [250, 251], 'RCPT TO');
    $command('DATA', [354], 'DATA');

    $messageId = bin2hex(random_bytes(12)) . '@pgresearch.org';
    $encodedBody = chunk_split(base64_encode($body));
    $emailPayload = implode("\r\n", [
        'Date: ' . date('r'),
        "From: {$cfg['from_name']} <{$cfg['from']}>",
        "To: <{$cfg['to']}>",
        "Reply-To: {$nameHeader} <{$email}>",
        'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
        "Message-ID: <{$messageId}>",
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        $encodedBody,
    ]) . "\r\n.\r\n";
    if (fwrite($sock, $emailPayload) === false) throw new RuntimeException('SMTP message write failed');
    $expect($readResponse(), [250], 'message acceptance');
    $command('QUIT', [221], 'QUIT');
    fclose($sock);

    respond(['ok' => true]);
} catch (Throwable $error) {
    $reference = bin2hex(random_bytes(4));
    error_log("[PGResearch contact {$reference}] " . $error->getMessage());
    fail("The message could not be delivered. Please email chris@puregamma.ai and reference {$reference}.", '', 500);
}
