# Bank of Baroda parser source notes

Public statement PDFs found online were either third-party demo statements or
real customer statements. Real customer statements were not committed as
fixtures.

Observed format sources:
- `https://www.scribd.com/document/918973542/Bank-of-Baroda-Statement-Demo`
- `https://www.scribd.com/document/999017184/BOB-Sample-Statement`

Parser layouts covered:
- `Date`, `Description`, `Ref No. / Cheque No.`, `Debit`, `Credit`, `Balance`
- `Date`, `Narration`, `Withdrawal (DR)`, `Deposit (CR)`, `Balance`
- `Value Date`, `Post Date`, `Details`, `Debit`, `Credit`, `Balance`
