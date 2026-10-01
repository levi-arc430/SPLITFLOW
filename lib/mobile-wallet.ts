"use client";

export function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function metaMaskDappUrl() {
  if (typeof window === "undefined") return "https://metamask.io/download/";

  const dappPath =
    window.location.host +
    window.location.pathname +
    window.location.search +
    window.location.hash;

  return "https://metamask.app.link/dapp/" + dappPath;
}

export function openMetaMaskMobileDapp() {
  if (typeof window === "undefined") return;

  // MetaMask's universal link opens the installed mobile app and loads this
  // exact dapp route in its in-app browser. If the app is missing, the
  // universal link provides the platform fallback.
  window.location.assign(metaMaskDappUrl());
}
