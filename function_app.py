import azure.functions as func
import os
import time
import json
import pandas as pd
from azure.storage.blob import BlobServiceClient
import io

# CRITICAL: This 'app' object is what Flex Consumption looks for to find your functions
app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

@app.route(route="data_analysis") # This replaces function.json
def diet_analysis_handler(req: func.HttpRequest) -> func.HttpResponse:
    start_time = time.time()

    try:
        # Initialize using the cloud environment variable 
        connection_string = os.environ["AZURE_STORAGE_CONNECTION_STRING"]
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        
        container_name = "datasets"
        blob_name = "All_Diets.csv"
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)

        # Download and process the CSV
        download_stream = blob_client.download_blob()
        df = pd.read_csv(io.BytesIO(download_stream.readall()))

        # Clean data
        df.fillna(df.mean(numeric_only=True), inplace=True)

        # Calculate averages
        avg_macros = df.groupby('Diet_type')[['Protein(g)', 'Carbs(g)', 'Fat(g)']].mean().to_dict(orient='index')

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
