// Scales the whole UI with the window: 75% up to about 1920x1080, larger on bigger screens (capped at 2x that).
(function () {
  var root = document.documentElement;
  function fit() {
    var k = Math.min(innerWidth / 1920, innerHeight / 1080);
    k = Math.max(1, Math.min(2, k));
    root.style.setProperty('--kbz', (0.75 * k).toFixed(3));
  }
  fit();
  addEventListener('resize', fit);
})();
