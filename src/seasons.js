(function () {
  "use strict";

  const SEASON_CODES = Object.freeze({
    "046": "2025-26",
    "045": "2024-25",
    "044": "2023-24",
    "043": "2022-23",
    "042": "2021-22",
    "041": "2020-21",
  });

  const codes = Object.keys(SEASON_CODES).sort();
  const DEFAULT_SEASON = codes[codes.length - 1] || "046";

  window.WKBLShared = Object.freeze({
    SEASON_CODES,
    DEFAULT_SEASON,
  });
})();
