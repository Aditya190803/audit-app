/**
 * Filter Visibility Matrix — defines which filters appear for each category tab.
 * true = visible, false/undefined = hidden
 */

type ResultFilter = 'all' | 'client' | 'broker' | 'suspicious'

export interface FilterVisibility {
  search: boolean
  clientName: boolean
  brokerName: boolean
  partyName: boolean
  direction: boolean
  amountRange: boolean
  dateRange: boolean
  financialYear: boolean
  month: boolean
  weekend: boolean
  paymentMethod: boolean
  exception: boolean
  tagSource: boolean
  tagConfidence: boolean
  clientActivityType: boolean
  minClientTxCount: boolean
  minClientAmount: boolean
  repeatClients: boolean
  suspiciousClients: boolean
  structuring: boolean
  pdfFile: boolean
  pageRange: boolean
  sameAmountCount: boolean
}

const VISIBILITY_MATRIX: Record<ResultFilter, FilterVisibility> = {
  all: {
    search: true,
    clientName: true,
    brokerName: true,
    partyName: true,
    direction: true,
    amountRange: true,
    dateRange: true,
    financialYear: true,
    month: true,
    weekend: true,
    paymentMethod: true,
    exception: true,
    tagSource: true,
    tagConfidence: true,
    clientActivityType: true,
    minClientTxCount: true,
    minClientAmount: true,
    repeatClients: true,
    suspiciousClients: true,
    structuring: true,
    pdfFile: true,
    pageRange: true,
    sameAmountCount: true,
  },
  client: {
    search: true,
    clientName: true,
    brokerName: false,
    partyName: true,
    direction: true,
    amountRange: true,
    dateRange: true,
    financialYear: false,
    month: false,
    weekend: false,
    paymentMethod: false,
    exception: false,
    tagSource: true,
    tagConfidence: true,
    clientActivityType: true,
    minClientTxCount: true,
    minClientAmount: true,
    repeatClients: true,
    suspiciousClients: false,
    structuring: false,
    pdfFile: false,
    pageRange: false,
    sameAmountCount: false,
  },
  broker: {
    search: true,
    clientName: false,
    brokerName: true,
    partyName: true,
    direction: true,
    amountRange: true,
    dateRange: true,
    financialYear: false,
    month: false,
    weekend: false,
    paymentMethod: false,
    exception: false,
    tagSource: true,
    tagConfidence: true,
    clientActivityType: false,
    minClientTxCount: false,
    minClientAmount: false,
    repeatClients: false,
    suspiciousClients: false,
    structuring: false,
    pdfFile: false,
    pageRange: false,
    sameAmountCount: false,
  },
  suspicious: {
    search: true,
    clientName: false,
    brokerName: false,
    partyName: true,
    direction: true,
    amountRange: true,
    dateRange: true,
    financialYear: false,
    month: false,
    weekend: true,
    paymentMethod: true,
    exception: true,
    tagSource: false,
    tagConfidence: false,
    clientActivityType: false,
    minClientTxCount: false,
    minClientAmount: false,
    repeatClients: false,
    suspiciousClients: true,
    structuring: true,
    pdfFile: false,
    pageRange: false,
    sameAmountCount: true,
  },
}

export function getFilterVisibility(tab: ResultFilter): FilterVisibility {
  return VISIBILITY_MATRIX[tab]
}

/** Returns inline dropdown config per tab */
export function getInlineDropdowns(tab: ResultFilter): { first: string; second: string } {
  switch (tab) {
    case 'all': return { first: 'clientName', second: 'exception' }
    case 'client': return { first: 'clientName', second: 'tagConfidence' }
    case 'broker': return { first: 'brokerName', second: 'tagSource' }
    case 'suspicious': return { first: 'exception', second: 'paymentMethod' }
  }
}
