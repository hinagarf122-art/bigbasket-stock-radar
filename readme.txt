BigBasket Stock Radar

This is a location-wise BigBasket availability checker based on the Croma
Stock Signal project. It keeps the original Croma project untouched.

Deploy

1. Deploy this folder as a Render Web Service with `npm start`, or use a Vercel-compatible host.
2. Open the HTTPS URL.
3. Type a pincode in Delivery locations and select the exact area suggestion.
4. Add numeric product IDs from BigBasket product URLs, then start checking.

Render settings

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

License access

- Each browser installation displays a random Device ID. Add a record such as `{ "id": "BBR-...", "deviceId": "<user-device-id>" }` to `licenses.json`.
- The app accepts only the license and matching Device ID through `POST /api/license`.
- The browser rechecks the license every 30 seconds and locks the checker if it becomes invalid.
- Replace the temporary IDs in `licenses.json` before production use. This repository is public, so real IDs should be kept in a private repository or moved to a secret-backed store.
- This is browser-installation binding, not a permanent hardware ID. Clearing browser storage, changing browser, or reinstalling can create a new Device ID.

PWA installation

- Open the HTTPS URL in a supported mobile or desktop browser and use its Install or Add to Home Screen option.
- The app includes a service worker and a 512px install icon.

How location selection works

The location picker uses BigBasket's public web autocomplete, place-details and
serviceability routes. The backend then updates a short-lived BigBasket visitor
session for each selected coordinate before reading BigBasket's product JSON
route, so stock is checked for the selected delivery area rather than for a
fixed city.

Notes

- BigBasket does not publish a stable third-party developer API. These web
  routes can change or rate-limit automated requests without notice.
- BigBasket's Next.js product build ID is kept in `api/bigbasket.js` and may
  need updating after a BigBasket frontend deployment.
- The UI supports 1 to 10 locations and defaults to one check every 4 seconds;
  aggressive polling can trigger BigBasket rate limits or temporary blocks.
- When stock is available, the alert sound repeats until the item is no longer
  available or the user presses Stop.
- Availability is a snapshot. A product can sell out before checkout.
- This project does not log in, place orders, or store user credentials.
