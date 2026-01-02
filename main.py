import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

files = [
    "Faulkner County Homes Sold 2021.csv",
    "Faulkner County Homes Sold 2022.csv",
    "Faulkner County Homes Sold 2023.csv",
    "Faulkner County Homes Sold 2024.csv",
    "Faulkner County Homes Sold 2025.csv"
]

all_data = []

for file in files:
    try:
        import os
        if not os.path.exists(file):
            print(f"Skipping {file} - not found")
            continue
        df = pd.read_csv(file)
        year = file.replace("Faulkner County Homes Sold ", "").replace(".csv", "")
        
        # Cleaning
        if 'Price' in df.columns:
            if df['Price'].dtype == 'object':
                df['Price'] = df['Price'].astype(str).str.replace(r'[$,]', '', regex=True)
                df['Price'] = pd.to_numeric(df['Price'], errors='coerce')
        
        if 'Price Per SQFT' in df.columns:
            if df['Price Per SQFT'].dtype == 'object':
                df['Price Per SQFT'] = df['Price Per SQFT'].astype(str).str.replace(r'[$,]', '', regex=True)
                df['Price Per SQFT'] = pd.to_numeric(df['Price Per SQFT'], errors='coerce')

        if 'Apx SQFT' in df.columns:
            if df['Apx SQFT'].dtype == 'object':
                 df['Apx SQFT'] = df['Apx SQFT'].astype(str).str.replace(',', '', regex=False)
            df['Apx SQFT'] = pd.to_numeric(df['Apx SQFT'], errors='coerce')
        
        if 'Apx YRB' in df.columns:
            df['Apx YRB'] = pd.to_numeric(df['Apx YRB'], errors='coerce')
        
        if 'City' in df.columns:
            df['City'] = df['City'].astype(str).str.strip()
        if 'Inside City Limits' in df.columns:
            df['Inside City Limits'] = df['Inside City Limits'].astype(str).str.strip()
        
        df['Year'] = year
        
        # Categorize
        if 'City' in df.columns and 'Inside City Limits' in df.columns:
            conway_mask = (df['City'].str.lower() == 'conway') & (df['Inside City Limits'].str.lower() == 'yes')
            df['Region'] = 'Other Faulkner County'
            df.loc[conway_mask, 'Region'] = 'Conway City'
        else:
            df['Region'] = 'Unknown'
        
        all_data.append(df)
    except Exception as e:
        print(f"Error: {e}")

if all_data:
    combined_df = pd.concat(all_data)
    # Aggregate for plotting
    annual_stats = combined_df.groupby(['Year', 'Region'])['Price'].median().reset_index()
    annual_counts = combined_df.groupby(['Year', 'Region']).size().reset_index().rename(columns={0: 'Sales Count'})

    # Plotting
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))

    # Median Price Trend
    sns.lineplot(data=annual_stats, x='Year', y='Price', hue='Region', marker='o', ax=axes[0])
    axes[0].set_title('Median Sales Price Trend (2021-2025)')
    axes[0].set_ylabel('Median Price ($)')
    axes[0].grid(True)

    # Sales Volume Trend
    sns.barplot(data=annual_counts, x='Year', y='Sales Count', hue='Region', ax=axes[1])
    axes[1].set_title('Total Homes Sold by Year')
    axes[1].set_ylabel('Number of Homes Sold')

    plt.tight_layout()
    plt.savefig('trends_preview.png')
else:
    print("No CSV files found for preliminary analysis")

import streamlit as st
import pandas as pd
import plotly.express as px
import numpy as np

# 1. SETUP & DATA LOADING
st.set_page_config(page_title="Faulkner County Real Estate Dashboard", layout="wide")
st.title("🏡 Faulkner County Real Estate Market (2021-2025)")

@st.cache_data
def load_data():
    files = {
        "2021": "Faulkner County Homes Sold 2021.csv",
        "2022": "Faulkner County Homes Sold 2022.csv",
        "2023": "Faulkner County Homes Sold 2023.csv",
        "2024": "Faulkner County Homes Sold 2024.csv",
        "2025": "Faulkner County Homes Sold 2025.csv"
    }
    
    all_dfs = []
    for year, filepath in files.items():
        try:
            # Check if file exists first
            import os
            if not os.path.exists(filepath):
                st.warning(f"File {filepath} not found. Skipping.")
                continue
            df = pd.read_csv(filepath)
            df['Report_Year'] = year
            # Basic Cleaning
            cols_to_clean = ['Price', 'Price Per SQFT', 'Apx SQFT', 'Days On Market']
            for col in cols_to_clean:
                if col in df.columns:
                    if df[col].dtype == 'object':
                        df[col] = df[col].astype(str).str.replace(r'[$,]', '', regex=True)
                        df[col] = pd.to_numeric(df[col], errors='coerce')
                    else:
                        df[col] = pd.to_numeric(df[col], errors='coerce')
                else:
                    df[col] = 0 # Fallback if column missing
            
            # Create Segments
            if 'City' in df.columns and 'Inside City Limits' in df.columns:
                df['City'] = df['City'].astype(str).str.strip()
                df['Inside City Limits'] = df['Inside City Limits'].astype(str).str.strip()
                
                is_conway = (df['City'].str.lower() == 'conway') & (df['Inside City Limits'].str.lower() == 'yes')
                df['Location Segment'] = 'Other Faulkner County'
                df.loc[is_conway, 'Location Segment'] = 'Conway City'
            else:
                df['Location Segment'] = 'Unknown'
            
            # Flag New Construction (based on your Approx YRB logic)
            # Logic: If Year Built is within 1-2 years of the Report Year
            year_int = int(year)
            if 'Apx YRB' in df.columns:
                df['Apx YRB'] = pd.to_numeric(df['Apx YRB'], errors='coerce')
                df['Is New Construction'] = df['Apx YRB'].isin([year_int, year_int - 1])
            else:
                df['Is New Construction'] = False
            
            all_dfs.append(df)
        except Exception as e:
            st.error(f"Could not load {year} data: {e}")
            
    if not all_dfs:
        st.error("No data loaded. Please check if CSV files exist.")
        return pd.DataFrame()
    return pd.concat(all_dfs, ignore_index=True)

df = load_data()

# 2. SIDEBAR FILTERS
st.sidebar.header("Filter Options")
if not df.empty:
    selected_years = st.sidebar.multiselect("Select Years", df['Report_Year'].unique(), default=df['Report_Year'].unique())
    selected_segment = st.sidebar.multiselect("Location", df['Location Segment'].unique(), default=df['Location Segment'].unique())

    filtered_df = df[
        (df['Report_Year'].isin(selected_years)) & 
        (df['Location Segment'].isin(selected_segment))
    ]

    # 3. KEY METRICS ROW
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Homes Sold", f"{len(filtered_df):,}")
    col2.metric("Median Sales Price", f"${np.nanmedian(filtered_df['Price']):,.0f}")
    col3.metric("Median Price/SqFt", f"${np.nanmedian(filtered_df['Price Per SQFT']):.2f}")
    col4.metric("Avg Days on Market", f"{np.nanmean(filtered_df['Days On Market']):.0f}")

    # 4. VISUALIZATIONS
    tab1, tab2, tab3 = st.tabs(["📈 Market Trends", "🏠 Value Analysis", "🏗️ New Construction"])

    with tab1:
        st.subheader("Median Price Trends Over Time")
        # Group by Year and Segment
        trend_data = filtered_df.groupby(['Report_Year', 'Location Segment'])['Price'].median().reset_index()
        fig_line = px.line(trend_data, x='Report_Year', y='Price', color='Location Segment', markers=True,
                           title="Median Sales Price by Year")
        st.plotly_chart(fig_line, use_container_width=True)

    with tab2:
        st.subheader("Price vs. Square Footage (Valuation Map)")
        st.write("Each dot is a home sale. Hover to see details.")
        fig_scatter = px.scatter(
            filtered_df, 
            x='Apx SQFT', 
            y='Price', 
            color='Location Segment',
            size='Price Per SQFT',
            hover_data=['Address', 'Subdivision', 'Apx YRB'],
            title="Price vs. Size Distribution"
        )
        st.plotly_chart(fig_scatter, use_container_width=True)

    with tab3:
        st.subheader("New vs. Existing Inventory")
        # Count new vs old
        counts = filtered_df.groupby(['Report_Year', 'Is New Construction']).size().reset_index().rename(columns={0: 'Count'})
        counts['Type'] = counts['Is New Construction'].apply(lambda x: 'Newly Built' if x else 'Existing Home')
        
        fig_bar = px.bar(counts, x='Report_Year', y='Count', color='Type', barmode='group',
                         title="Volume of New vs. Existing Homes Sold")
        st.plotly_chart(fig_bar, use_container_width=True)
else:
    st.info("Please upload data to view the dashboard.")