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
- Do not poll aggressively. The UI defaults to one check every 30 seconds.
- Availability is a snapshot. A product can sell out before checkout.
- This project does not log in, place orders, or store user credentials.
