# RBL Bank parser source notes

The statement sample found online exposed personal account details, so it was
not committed as a fixture.

Observed format source:
- `https://www.scribd.com/document/798411692/Statement-of-January-2024-xxxxx7487-unlocked-1`

Parser layout covered:
- `Date`
- `Narration`
- `Withdrawals (Dr)`
- `Deposits (Cr)`
- `Balance (INR)`
