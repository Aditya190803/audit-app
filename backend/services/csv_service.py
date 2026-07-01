import csv
import pandas as pd
from typing import List, Dict, Any

class CSVService:
    def parse_client_list(
        self,
        file_path: str,
        sheet_name: str = None,
        name_column: str = None,
        strict: bool = False,
    ) -> List[Dict[str, Any]]:
        """Parse a CSV or Excel client list and return normalized client records."""
        clients = []
        
        # Determine file type
        is_excel = file_path.endswith(('.xlsx', '.xls'))
        
        try:
            if is_excel:
                # Read Excel file
                if sheet_name:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                else:
                    df = pd.read_excel(file_path)
            else:
                # Read CSV file
                df = pd.read_csv(file_path)
            
            # Determine name column
            if name_column and name_column in df.columns:
                name_col = name_column
            else:
                # Auto-detect name column
                name_col = None
                for col in df.columns:
                    col_lower = str(col).lower().strip()
                    if col_lower in {'name', 'client name', 'customer name', 'party name'}:
                        name_col = col
                        break
                for col in df.columns:
                    if name_col is not None:
                        break
                    col_lower = str(col).lower().strip()
                    if any(keyword in col_lower for keyword in ['name', 'customer', 'party', 'account']):
                        name_col = col
                        break
                
                # If no name column found, use first column
                if name_col is None and len(df.columns) > 0:
                    name_col = df.columns[0]
            
            if name_col is None:
                return clients
            
            # Parse rows
            for idx, row in df.iterrows():
                name = str(row[name_col]).strip() if pd.notna(row[name_col]) else ""
                if name and name.lower() != 'nan':
                    client = {
                        "name": name,
                        "raw_data": row.to_dict()
                    }
                    clients.append(client)
                    
        except Exception as e:
            print(f"[CSVService] Error parsing file: {e}")
            # Fallback to standard csv module for CSV files
            if not is_excel:
                try:
                    with open(file_path, 'r', encoding='utf-8-sig') as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            # Determine name column
                            if name_column and name_column in row:
                                name_col = name_column
                            else:
                                name_col = None
                                for key in row.keys():
                                    if any(keyword in key.lower() for keyword in ['name', 'client', 'customer']):
                                        name_col = key
                                        break
                                if name_col is None:
                                    name_col = list(row.keys())[0] if row.keys() else None
                            
                            if name_col:
                                name = row[name_col].strip()
                                if name:
                                    clients.append({
                                        "name": name,
                                        "raw_data": row
                                    })
                except Exception as e2:
                    print(f"[CSVService] Fallback CSV parsing failed: {e2}")
                    if strict:
                        raise ValueError(f"Failed to parse client list: {e2}") from e2
            elif strict:
                raise ValueError(f"Failed to parse client list: {e}") from e
        
        return clients

    def _get_ap_code_value(self, raw_data: dict) -> str | None:
        for key in raw_data:
            normalized = str(key).lower().strip().replace(' ', '_').replace('-', '_')
            if normalized in ('ap_code', 'apcode', 'ap_codes', 'apcodes', 'ap'):
                val = str(raw_data[key]).strip()
                if val and val.lower() not in ('nan', '', 'none', 'null'):
                    return val
        return None

    def filter_clients_by_ap_codes(self, clients: list, selected_ap_codes: list) -> list:
        selected = set(selected_ap_codes)
        result = []
        for client in clients:
            raw = client.get('raw_data', {})
            ap_code = self._get_ap_code_value(raw)
            if not ap_code or ap_code in selected:
                result.append(client)
        return result

    def normalize_name(self, name: str) -> str:
        """Normalize a name for matching."""
        name = name.strip()
        name = ' '.join(name.split())  # Remove extra spaces
        name = name.lower()
        # Remove common suffixes/prefixes but keep core name
        return name
