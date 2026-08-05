const nodemailer = require('nodemailer');
const config = require('../config');

// Generic SMTP sender. Works with any provider, so you're not locked into
// one vendor. Easiest free options to get started:
//   - Brevo (ex-Sendinblue): 300 e-mails/dia grátis, SMTP simples de configurar
//   - Resend: 3.000 e-mails/mês grátis, API/SMTP simples
//   - Gmail: smtp.gmail.com + "senha de app" (2FA precisa estar ativo)

function enabled() {
  return Boolean(config.get('SMTP_HOST'));
}

function buildTransporter() {
  const port = Number(config.get('SMTP_PORT') || 587);
  const user = config.get('SMTP_USER');
  return nodemailer.createTransport({
    host: config.get('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: user ? { user, pass: config.get('SMTP_PASS') } : undefined,
    // Nodemailer usa ~2min de default se isso não for setado — encurtado
    // pra falhar rápido e não travar a resposta de runSearch() (mesmo
    // raciocínio dos timeouts adicionados nos providers de preço/WhatsApp/
    // Telegram: uma chamada de rede sem timeout curto trava a busca inteira
    // até o proxy do host derrubar a conexão sem resposta HTTP).
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  });
}

async function sendEmailAlert({ to, subject, html }) {
  if (!enabled()) {
    return { status: 'not_configured', message: 'Configure SMTP na tela de Configurações para ativar alertas por e-mail.' };
  }
  const transporter = buildTransporter();
  await transporter.sendMail({
    from: config.get('FROM_EMAIL') || config.get('SMTP_USER'),
    to,
    subject,
    html,
  });
  return { status: 'sent' };
}

module.exports = { enabled, sendEmailAlert };
