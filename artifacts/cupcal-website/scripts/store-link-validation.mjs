const storeDomains = ['play.google.com', 'apps.apple.com', 'itunes.apple.com'];

function normalizeConfirmedLinks(confirmedStoreLinks) {
  return new Set(
    confirmedStoreLinks
      .filter((url) => url !== null)
      .map((url) => new URL(url).href),
  );
}

export function assertStoreLinksConfirmed(
  storeLinks,
  { baseUrl, confirmedStoreLinks },
) {
  const confirmedUrls = normalizeConfirmedLinks(confirmedStoreLinks);
  const unconfirmedTargets = [];

  for (const { pagePath, href } of storeLinks) {
    let targetUrl;
    try {
      targetUrl = new URL(href, baseUrl);
    } catch {
      continue;
    }

    const isStoreTarget = storeDomains.some((domain) =>
      targetUrl.hostname === domain || targetUrl.hostname.endsWith(`.${domain}`),
    );
    if (isStoreTarget && !confirmedUrls.has(targetUrl.href)) {
      unconfirmedTargets.push(`${pagePath} → ${targetUrl.href}`);
    }
  }

  if (unconfirmedTargets.length > 0) {
    throw new Error(
      `Nicht bestätigte Store-Adressen dürfen nicht als Download-Ziel verlinkt sein:\n${unconfirmedTargets.join('\n')}`,
    );
  }
}
