import pandas as pd
from datetime import datetime
from backend.app.services.analytics_service import infer_metric_mappings, _uses_average_basis

df = pd.DataFrame({
    'date': pd.date_range('2024-01-01', periods=100, freq='D'),
    'Impressions': [1000] * 100,
    'Clicks': [10] * 100,
    'Cost': [5.0] * 100,
    'Revenue': [10.0] * 100,
    'Conversions': [2] * 100,
    'CTR': [0.01] * 100,
    'CPC': [0.5] * 100,
    'ROAS': [2.0] * 100,
    'CPA': [2.5] * 100
})

metric_mappings = infer_metric_mappings(df)
print(metric_mappings)
