# IndusInd Bank parser source notes

Public statement PDFs found online exposed personal or business account details,
so they were not committed as fixtures.

Observed format sources:
- `https://www.scribd.com/document/929792534/IndusIndAccountStatement-XXXXXXXX0816-7-5-2025-21-14-2-0-UPDATED`
- `https://www.scribd.com/document/984738949/201017950704-1765880240865`

Parser layout covered:
- `Date`
- `Particulars`
- `Chq./Ref.`
- `Withdrawl` / `Withdrawal`
- `Deposit`
- `Balance`
