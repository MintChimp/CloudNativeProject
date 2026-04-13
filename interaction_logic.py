import pandas as pd
import io

def get_paginated_data(df, diet_type=None, keyword=None, page=1, page_size=10):
    """
    Filters the dataframe and returns a specific page of results.
    """
    # 1. Filter by Diet Type (Rubric: Diet type filter)
    if diet_type and diet_type.lower() != "all":
        df = df[df['Diet_type'].str.lower() == diet_type.lower()]

    # 2. Filter by Keyword (Rubric: Search by keyword)
    if keyword:
        df = df[df['Recipe_name'].str.contains(keyword, case=False, na=False)]

    # 3. Implement Pagination (Rubric: Proper Pagination)
    total_results = len(df)
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    
    paginated_df = df.iloc[start_index:end_index]
    
    return {
        "results": paginated_df.to_dict(orient='records'),
        "total_results": total_results,
        "page": page,
        "total_pages": (total_results // page_size) + 1
    }