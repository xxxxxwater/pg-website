function initContactForm() {
  const form   = document.getElementById('contact-form');
  if (!form) return;
  const status = document.getElementById('form-status');
  const btn    = form.querySelector('button[type="submit"]');
  let proofPromise = createContactProof();
  proofPromise.catch(() => {});
  const fields = ['name', 'email', 'company', 'role', 'message']
    .map((name) => form.elements[name])
    .filter(Boolean);
  const textLength = (value) => Array.from(value.trim()).length;
  const hasText = (value) => /[\p{L}\p{N}]/u.test(value);
  const hasUrl = (value) => /(?:https?:\/\/|www\.)/i.test(value);
  const urlCount = (value) => (value.match(/(?:https?:\/\/|www\.)/gi) || []).length;

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function createContactProof() {
    const response = await fetch('contact.php?challenge=1', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const challenge = await response.json();
    if (!response.ok || !challenge.ok || !challenge.token) {
      throw new Error(challenge.error || 'Verification service unavailable');
    }

    const prefix = '0'.repeat(Math.max(1, Number(challenge.difficulty) || 3));
    for (let counter = 0; counter < 2000000; counter += 1) {
      const digest = await sha256Hex(`${challenge.token}:${counter}`);
      if (digest.startsWith(prefix)) {
        return { token: challenge.token, proof: String(counter) };
      }
      if (counter > 0 && counter % 250 === 0) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    throw new Error('Verification could not be completed');
  }

  const rules = {
    name(field) {
      const value = field.value.trim();
      if (textLength(value) < 2 || textLength(value) > 80) return 'Use 2-80 characters for your name.';
      if (!hasText(value)) return 'Name must include letters or numbers.';
      if (hasUrl(value)) return 'Name cannot contain links.';
      return '';
    },
    email(field) {
      const value = field.value.trim();
      if (!value || value.length > 120 || !field.validity.valid) return 'Enter a valid email address.';
      return '';
    },
    company(field) {
      const value = field.value.trim();
      if (textLength(value) < 2 || textLength(value) > 120) return 'Use 2-120 characters for company or organization.';
      if (!hasText(value)) return 'Company / Organization must include letters or numbers.';
      if (hasUrl(value)) return 'Company / Organization cannot contain links.';
      return '';
    },
    role(field) {
      const value = field.value.trim();
      if (textLength(value) < 2 || textLength(value) > 80) return 'Use 2-80 characters for role or title.';
      if (!hasText(value)) return 'Role / Title must include letters or numbers.';
      if (hasUrl(value)) return 'Role / Title cannot contain links.';
      return '';
    },
    message(field) {
      const value = field.value.trim();
      if (textLength(value) < 20 || textLength(value) > 2000) return 'Message must be 20-2000 characters.';
      if (!hasText(value)) return 'Message must include meaningful text.';
      if (urlCount(value) > 3) return 'Message can include no more than 3 links.';
      return '';
    },
  };

  function setFieldError(field, message) {
    const error = form.querySelector(`[data-error-for="${field.name}"]`);
    field.classList.toggle('is-invalid', Boolean(message));
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (error) {
      error.textContent = message;
      error.classList.toggle('is-visible', Boolean(message));
    }
  }

  function validateField(field) {
    const rule = rules[field.name];
    if (!rule) return true;
    const message = rule(field);
    setFieldError(field, message);
    return !message;
  }

  function validateForm() {
    let firstInvalid = null;
    fields.forEach((field) => {
      if (!validateField(field) && !firstInvalid) firstInvalid = field;
    });
    return firstInvalid;
  }

  fields.forEach((field) => {
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.classList.contains('is-invalid')) validateField(field);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const firstInvalid = validateForm();
    status.className = 'form-status';
    status.textContent = '';
    if (firstInvalid) {
      status.className = 'form-status error';
      status.textContent = 'Please fix the highlighted fields before sending.';
      firstInvalid.focus();
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Sending...';

    try {
      const proof = await proofPromise;
      const formData = new FormData(form);
      formData.append('challenge_token', proof.token);
      formData.append('challenge_proof', proof.proof);
      const res = await fetch('contact.php', {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (data.ok) {
        status.className   = 'form-status success';
        status.textContent = 'Message sent. We will be in touch shortly.';
        form.reset();
        fields.forEach((field) => setFieldError(field, ''));
      } else {
        if (data.field && form.elements[data.field]) {
          setFieldError(form.elements[data.field], data.error || 'Please check this field.');
          form.elements[data.field].focus();
        }
        throw new Error(data.error || 'Send failed');
      }
    } catch (err) {
      status.className   = 'form-status error';
      status.textContent = `Could not send: ${err.message}`;
    } finally {
      proofPromise = createContactProof();
      proofPromise.catch(() => {});
      btn.disabled    = false;
      btn.textContent = 'Send Message';
    }
  });
}

'use strict';

function initReleaseNavigation() {
  const toggle = document.querySelector('.menu-button');
  const nav = document.querySelector('.header-links');
  const close = () => {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    toggle.textContent = '☰';
  };
  toggle.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    toggle.textContent = open ? '×' : '☰';
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) close(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) { close(); toggle.focus(); }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.release-header')) close();
  });
  const links = [...document.querySelectorAll('.page-index a')];
  const sections = [...document.querySelectorAll('.article-section')];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(link => {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    });
  }, {rootMargin: '-100px 0px -55% 0px', threshold: 0});
  sections.forEach(section => observer.observe(section));
}

function initReleaseChart() {
  const rows = window.PG_NET_VALUE_DATA;
  if (!Array.isArray(rows) || rows.length < 2) return;
  const svg = document.querySelector('#nav-chart');
  const plot = svg.parentElement;
  const tooltip = plot.querySelector('.chart-tooltip');
  const panel = document.querySelector('#chart-panel');
  const buttons = [...document.querySelectorAll('[data-chart-mode]')];
  const ns = 'http://www.w3.org/2000/svg';
  let mode = 'nav';
  let current = rows.length - 1;
  let peak = -Infinity;
  const drawdowns = rows.map(row => {
    peak = Math.max(peak, row.nav);
    return row.nav / peak - 1;
  });
  let layout;
  let markerLine;
  let markerDot;
  const percent = value => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
  const append = (name, attrs, text) => {
    const el = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text !== undefined) el.textContent = text;
    svg.appendChild(el);
    return el;
  };
  function render() {
    const mobile = plot.clientWidth < 550;
    const width = mobile ? 650 : 960;
    const height = 420;
    const margin = {left: mobile ? 61 : 58, right: 20, top: 20, bottom: 43};
    const values = mode === 'nav' ? rows.map(row => row.nav) : drawdowns;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = Math.max((high-low)*0.08, mode === 'nav' ? 0.025 : 0.003);
    const min = mode === 'nav' ? low-padding : Math.floor(low*100)/100 - 0.005;
    const max = mode === 'nav' ? high+padding : 0;
    const w = width-margin.left-margin.right;
    const h = height-margin.top-margin.bottom;
    const x = i => margin.left + i / (rows.length - 1) * w;
    const y = v => margin.top + (max-v)/(max-min)*h;
    layout = {width, height, margin, w, h, x, y, values};
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.replaceChildren();
    for (let i=0; i<=4; i++) {
      const value = min+(max-min)*i/4;
      const at = y(value);
      append('line',{x1:margin.left,y1:at,x2:width-margin.right,y2:at,stroke:'#e4e4e4','stroke-width':1});
      append('text',{x:margin.left-11,y:at+4,'text-anchor':'end','font-size':12,'font-family':'Inter, Arial, sans-serif',fill:'#888'},mode==='nav'?value.toFixed(2):`${(value*100).toFixed(1)}%`);
    }
    const n = mobile ? 3 : 5;
    for (let i=0; i<=n; i++) {
      const index = Math.round(i/n*(rows.length-1));
      append('text',{x:x(index),y:height-15,'text-anchor': i===0?'start':i===n?'end':'middle','font-size':11,'font-family':'IBM Plex Mono, monospace',fill:'#888'},rows[index].date.slice(0,7));
    }
    const line = values.map((v,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(v).toFixed(2)).join(' ');
    const base = mode === 'nav' ? height-margin.bottom : y(0);
    append('path',{d:line+` L ${x(rows.length-1)},${base} L ${x(0)},${base} Z`,fill:mode==='nav'?'#f2f2f2':'#e9e9e9'});
    append('path',{d:line,fill:'none',stroke:'#222','stroke-width':1.7,'stroke-linejoin':'round','stroke-linecap':'round','vector-effect':'non-scaling-stroke'});
    append('circle',{cx:x(rows.length-1),cy:y(values[values.length-1]),r:3,fill:'#111'});
    markerLine = append('line',{x1:0,x2:0,y1:margin.top,y2:height-margin.bottom,stroke:'#777','stroke-dasharray':'3 4',visibility:'hidden'});
    markerDot = append('circle',{cx:0,cy:0,r:4,fill:'#111',stroke:'#fff','stroke-width':1.5,visibility:'hidden'});
    tooltip.classList.remove('visible');
    document.querySelector('#nav-title').textContent=mode==='nav'?'CTA composite · Reported NAV':'CTA composite · Drawdown from running peak';
    plot.setAttribute('aria-label',`${mode==='nav'?'Net Value Curve':'Historical drawdown'} from 2022-09-01 to 2026-10-09. Use left and right arrow keys to inspect daily observations.`);
  }
  function show(index) {
    current=Math.max(0,Math.min(rows.length-1,index));
    const row=rows[current];
    const {x,y,values,width,height}=layout;
    const atX=x(current); const atY=y(values[current]);
    markerLine.setAttribute('x1',atX); markerLine.setAttribute('x2',atX); markerLine.setAttribute('visibility','visible');
    markerDot.setAttribute('cx',atX); markerDot.setAttribute('cy',atY); markerDot.setAttribute('visibility','visible');
    tooltip.replaceChildren();
    const date=document.createElement('div'); date.textContent=row.date;
    const value=document.createElement('div'); value.textContent=mode==='nav'?`NAV ${row.nav.toFixed(4)}`:`Drawdown ${percent(drawdowns[current])}`;
    const ret=document.createElement('div'); ret.textContent=`Return ${percent(row.nav/rows[0].nav-1)}`;
    tooltip.append(date,value,ret); tooltip.classList.add('visible');
    const rect=plot.getBoundingClientRect();
    const px=atX/width*rect.width; const py=atY/height*rect.height;
    const left=Math.min(Math.max(8,px+12),rect.width-tooltip.offsetWidth-8);
    const top=Math.min(Math.max(4,py-tooltip.offsetHeight-12),rect.height-tooltip.offsetHeight-4);
    tooltip.style.left=left+'px'; tooltip.style.top=top+'px';
    plot.setAttribute('aria-label',`${row.date}. NAV ${row.nav.toFixed(4)}. Cumulative return ${percent(row.nav/rows[0].nav-1)}. Drawdown ${percent(drawdowns[current])}.`);
  }
  function fromPointer(event) {
    const rect=plot.getBoundingClientRect();
    const point=(event.clientX-rect.left)/rect.width*layout.width;
    show(Math.round((point-layout.margin.left)/layout.w*(rows.length-1)));
  }
  plot.addEventListener('pointermove',fromPointer);
  plot.addEventListener('pointerdown',fromPointer);
  plot.addEventListener('pointerleave',()=>{
    if(document.activeElement===plot) return;
    tooltip.classList.remove('visible'); markerLine.setAttribute('visibility','hidden'); markerDot.setAttribute('visibility','hidden');
  });
  plot.addEventListener('focus',()=>show(current));
  plot.addEventListener('blur',()=>{tooltip.classList.remove('visible');markerLine.setAttribute('visibility','hidden');markerDot.setAttribute('visibility','hidden');});
  plot.addEventListener('keydown',event=>{
    let next=current;
    if(event.key==='ArrowLeft') next--;
    else if(event.key==='ArrowRight') next++;
    else if(event.key==='Home') next=0;
    else if(event.key==='End') next=rows.length-1;
    else return;
    event.preventDefault(); show(next);
  });
  function select(button) {
    mode=button.dataset.chartMode;
    buttons.forEach(btn=>{const selected=btn===button;btn.setAttribute('aria-selected',String(selected));btn.tabIndex=selected?0:-1;});
    panel.setAttribute('aria-labelledby',button.id); render();
  }
  buttons.forEach((button,index)=>{
    button.addEventListener('click',()=>select(button));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      select(buttons[next]); buttons[next].focus();
    });
  });
  const resize=new ResizeObserver(render); resize.observe(plot); render();
}

function initReleaseDetails() {
  const contact=document.querySelector('#contact-details');
  let initialized=false;
  if (contact) contact.addEventListener('toggle',()=>{
    if(contact.open&&!initialized){initialized=true;initContactForm();}
  });
  const contactToggle = document.querySelector('.contact-toggle');
  if (contactToggle && contact) contactToggle.addEventListener('click',()=>{
    contact.open=true;
    contact.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
    document.querySelector('#cf-name').focus({preventScroll:true});
  });
  document.querySelectorAll('.pdf-details').forEach(details=>{
    details.addEventListener('toggle',()=>{
      if(!details.open)return;
      const frame=details.querySelector('iframe[data-src]');
      if(frame&&!frame.hasAttribute('src'))frame.src=frame.dataset.src;
    });
  });
}

document.addEventListener('DOMContentLoaded',()=>{
  initReleaseNavigation();
  initReleaseChart();
  initReleaseDetails();
});
