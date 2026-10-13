// Shows the customer why AZUL declined the payment, using the result AZUL
// puts in the querystring of DeclinedUrl.
import { resolvePaymentError } from './payment-errors.js';

const params = new URLSearchParams(location.search);

// AZUL's parameter names are not consistent in case (IsoCode / ISOCode).
function param(name) {
  for (const [key, value] of params) {
    if (key.toLowerCase() === name.toLowerCase()) return value;
  }
  return '';
}

const error = resolvePaymentError({
  isoCode: param('IsoCode'),
  message: `${param('ResponseMessage')} ${param('ErrorDescription')}`,
});

if (error.key) {
  const reason = document.getElementById('reason');
  reason.textContent = window.translate(error.key, '');
  reason.hidden = !reason.textContent;
}

if (error.code) {
  const code = document.getElementById('code');
  code.textContent = `${window.translate('errorCode', 'Código')}: ${error.code}`;
  code.hidden = false;
}
