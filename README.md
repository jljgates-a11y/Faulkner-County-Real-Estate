# Faulkner County Real Estate Dashboard

Interactive Streamlit dashboard analyzing home sales data for Faulkner County, Arkansas from 2021-2025.

## Overview

This tool visualizes real estate market trends with a focus on comparing **Conway City** (inside city limits) versus **Other Faulkner County** areas. It helps answer questions like:

- Is the market going up or down?
- What's the fair value for homes based on square footage?
- How does new construction compare to existing home sales?

## Features

### Key Metrics
- Total homes sold
- Median sales price
- Median price per square foot
- Average days on market

### Visualizations

| Tab | Description |
|-----|-------------|
| **Market Trends** | Median price trends over time by location segment |
| **Value Analysis** | Price vs. square footage scatter plot (identify over/undervalued homes) |
| **New Construction** | Volume comparison of new builds vs. existing homes |

### Filters
- Year selection (2021-2025)
- Location segment (Conway City / Other Faulkner County)

## Data Requirements

Place CSV files in the project root with this naming convention:

```
Faulkner County Homes Sold 2021.csv
Faulkner County Homes Sold 2022.csv
Faulkner County Homes Sold 2023.csv
Faulkner County Homes Sold 2024.csv
Faulkner County Homes Sold 2025.csv
```

### Expected Columns

| Column | Description |
|--------|-------------|
| `Price` | Sale price (can include `$` and commas) |
| `Price Per SQFT` | Price per square foot |
| `Apx SQFT` | Approximate square footage |
| `Apx YRB` | Approximate year built |
| `City` | City name |
| `Inside City Limits` | Yes/No |
| `Days On Market` | Days listed before sale |
| `Address` | Property address |
| `Subdivision` | Subdivision name |

## Installation

### Using uv (recommended)

```bash
uv sync
uv run streamlit run main.py
```

### Using pip

```bash
pip install streamlit pandas plotly matplotlib seaborn
streamlit run main.py
```

## Usage

```bash
streamlit run main.py
```

The dashboard will open in your browser at `http://localhost:8501`.

## Tech Stack

- **Python 3.11+**
- **Streamlit** - Web application framework
- **Pandas** - Data manipulation
- **Plotly** - Interactive charts
- **Matplotlib/Seaborn** - Static chart generation

## How It Works

1. **Data Loading**: Reads all yearly CSV files and combines them
2. **Cleaning**: Strips currency symbols, converts to numeric types
3. **Segmentation**: Categorizes homes as "Conway City" (city=Conway AND inside city limits=Yes) or "Other Faulkner County"
4. **New Construction Flag**: Marks homes as new if year built is within 1-2 years of sale year
5. **Visualization**: Renders interactive Plotly charts with filtering

## Project Structure

```
.
├── main.py              # Streamlit application
├── pyproject.toml       # Python dependencies
├── uv.lock              # Lock file for uv
├── conversation.md      # Development notes
└── *.csv                # Data files (not included)
```

## License

Not specified.
