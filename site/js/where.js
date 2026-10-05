// Where is this catalog mounted, and where is Meckie OS from here?
//
// The same files are served two ways: standalone (`npm run site`, at /) and
// mounted on meckie.ai under /bodies. Rather than keep two copies of the HTML,
// every link is built through here.
//
// `site` is the other half of the cross-reference: from a body page you should
// be able to get to Meckie OS, and from meckie.ai you should be able to get
// here. Mounted, that is same-origin. Standalone it needs an address, which
// defaults to the marketing site running locally and can be overridden with
//   <meta name="meckie-site" content="https://meckie.ai">
(function () {
  var m = /^\/bodies(\/|$)/.test(location.pathname);
  var prefix = m ? '/bodies' : '';
  var meta = document.querySelector('meta[name="meckie-site"]');
  var site = m ? '' : ((meta && meta.content) || 'http://localhost:3200');

  window.MKT = {
    mounted: m,
    prefix: prefix,
    home: m ? '/bodies' : '/',
    // A body's page. The two mounts spell this differently because /bodies/x
    // would collide with the catalog's own static files when standalone.
    body: function (slug) { return m ? '/bodies/' + slug : '/body/' + slug; },
    contribute: m ? '/bodies/contribute' : '/contribute',
    data: function (file) { return prefix + '/data/' + file; },
    packs: function (p) { return prefix + '/packs/' + p; },
    // Served at the root in both mounts, so Hangar Bay's catalog URL is the
    // same shape wherever the marketplace lives.
    feed: '/bodies.json',
    api: function (p) { return '/api/bodies/' + p; },
    // Meckie OS, from here.
    site: site,
    os: site + '/#os',
    plans: site + '/#plans',
    bodiesSection: site + '/#bodies',
  };
})();
