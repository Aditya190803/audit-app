# Canara Bank parser source notes

Public statement PDFs found online exposed personal account details, so they were
not committed as fixtures.

Observed format sources:
- `https://www.scribd.com/document/971861717/04811010005762`
- `https://ro.scribd.com/document/418326183/2662098-1559202194042`

Parser layout covered:
- `TRANS`
- `VALUE`
- `BRANCH`
- `REF/CHQ.NO`
- `DESCRIPTION`
- `WITHDRAWS`
- `DEPOSIT`
- `BALANCE`
