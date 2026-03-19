import azure.functions as func
import os
import time
import json
import pandas as pd
from azure.storage.blob import BlobServiceClient
import io

def main(req: func.HttpRequest) -> func.HttpResponse:
    # Start timer for required metadata 
    start_time = time.time()

    try:
        # Initialize using the cloud environment variable 
        connection_string = os.environ["AZURE_STORAGE_CONNECTION_STRING"]
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        
        # Access the live 'datasets' container 
        container_name = "datasets"
        blob_name = "All_Diets.csv"
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)

        # Download and process the CSV
        download_stream = blob_client.download_blob()
        df = pd.read_csv(io.BytesIO(download_stream.readall()))

        # Clean data as per Task 1 requirements
        df.fillna(df.mean(numeric_only=True), inplace=True)

        # Calculate average macronutrients
        # Using exact column names from the All_Diets.csv specification
        avg_macros = df.groupby('Diet_type')[['Protein(g)', 'Carbs(g)', 'Fat(g)']].mean().to_dict(orient='index')

        # Prepare metadata for the Phase 2 Dashboard 
        execution_time = time.time() - start_time
        
        response_payload = {
            "insights": avg_macros,
            "metadata": {
                "execution_time": f"{execution_time:.4f}s",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "status": "Cloud Deployment Successful"
            }
        }

        return func.HttpResponse(
            body=json.dumps(response_payload),
            mimetype="application/json",
            status_code=200
        )

    except Exception as e:
        return func.HttpResponse(
            body=json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500
        )