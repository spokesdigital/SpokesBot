import pandas as pd
import json

df = pd.read_csv("(Meta)Wholesomeco New Template - Raw Data - wholesome Facebook campaign data.csv")
print("Columns:")
print(list(df.columns))

if 'Date' in df.columns:
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    grouped = df.groupby(df['Date'].dt.date).agg({
        c: 'sum' for c in df.select_dtypes(include='number').columns
    }).reset_index()
    print("Daily aggregation:")
    print(grouped.to_string())
else:
    print("No Date col found")
