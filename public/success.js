// Fills the payment receipt from the querystring that /api/approved builds.
(function () {
  var params = new URLSearchParams(location.search);
  var order = params.get('order');
  var quantity = Number(params.get('qty'));
  var amountCents = Number(params.get('amount'));
  if (!order || !quantity || !amountCents) return;

  function money(cents) {
    return 'RD$' + (cents / 100).toFixed(2);
  }

  // AZUL sends DateTime as YYYYMMDDHHMMSS. Anything else is shown as is.
  function formatDate(raw) {
    var match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\d{2}$/.exec(raw || '');
    if (!match) return raw || '';
    return match[3] + '/' + match[2] + '/' + match[1] + ' ' + match[4] + ':' + match[5];
  }

  function set(id, text) {
    document.getElementById(id).textContent = text;
  }

  set('r-date', formatDate(params.get('date')));
  set('r-order', order);
  set('r-auth', params.get('auth') || '');
  var card = params.get('card');
  if (/^\d{4}$/.test(card || '')) {
    set('r-card', '•••• ' + card);
    document.getElementById('r-card').hidden = false;
    document.getElementById('r-card-label').hidden = false;
  }
  set('r-qty', quantity + ' × ' + money(amountCents / quantity));
  set('r-total', money(amountCents) + ' DOP');
  document.getElementById('receipt').hidden = false;
})();
