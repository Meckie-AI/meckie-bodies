# The Open Graph card

`og-bodies.png` is the preview image chat apps and search results show when a
catalog link is pasted. It is a screenshot of `card.html`, which lays four of
the bodies out at 1200x630 using the packs' own three.js viewers in embed mode
(`?embed=1&view=iso`) — so the bodies in the card are the real geometry, not a
drawing that can drift from it.

## Rebuilding

    # 1. serve the pack repo and the card
    npx http-server . -p 4300 --silent --cors &
    npx http-server tools/og-card -p 4301 --silent &

    # 2. a browser that can actually do WebGL
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless=new --remote-debugging-port=9666 \
      --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
      --hide-scrollbars --no-first-run --user-data-dir=/tmp/chrome-og &

    # 3. shoot it
    OUT=/tmp/og-bodies.png node tools/og-card/shoot.js

**`--disable-gpu` does not work.** It leaves headless Chrome with no WebGL at
all, and every viewer renders "Error creating WebGL context" instead of a body.
Software rendering through SwiftShader is what makes this work without a
display.

The shot is taken at `deviceScaleFactor: 2`, so the file is 2400x1260 for a
1200x630 card.

## Where it goes

The image must be served from the PUBLIC marketing site, not from this
catalog: with the catalog behind its private link, an unfurler fetching the
image has no token and would get a 404, so the card would come out blank. Copy
the output to the marketing repo:

    cp /tmp/og-bodies.png ../droid-market/site/images/og-bodies.png

That path is already public and already routed, so it needs no other change.
