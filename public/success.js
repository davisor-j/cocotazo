// Shows the order details that /api/approved puts in the querystring.
(function () {
  var params = new URLSearchParams(location.search);
  var order = params.get('order');
  var quantity = params.get('qty');
  if (!order || !quantity) return;

  var detail = document.getElementById('detail');
  detail.textContent = window.translate('detail', 'Cocos: {qty} · Orden #{order}')
    .replace('{qty}', quantity)
    .replace('{order}', order);
  detail.hidden = false;
})();
