// Quantity stepper and live total for index.html.
// The page still works without this script: the number field posts on its own.
(function () {
  var PRICE = 100;
  var quantity = document.getElementById('quantity');
  var total = document.getElementById('total');
  var min = Number(quantity.min);
  var max = Number(quantity.max);

  function update(value) {
    var clamped = Math.min(max, Math.max(min, Math.round(value) || min));
    quantity.value = clamped;
    total.textContent = 'RD$' + clamped * PRICE;
  }

  document.getElementById('less').addEventListener('click', function () {
    update(Number(quantity.value) - 1);
  });
  document.getElementById('more').addEventListener('click', function () {
    update(Number(quantity.value) + 1);
  });
  quantity.addEventListener('change', function () {
    update(Number(quantity.value));
  });

  update(Number(quantity.value));
})();
