import azure.functions as func
import os
import json
import bcrypt
import time
import pandas as pd
import io
import logging
from azure.cosmos import CosmosClient, PartitionKey
from azure.storage.blob import BlobServiceClient
from interaction_logic import get_paginated_data

logging.info("Python Worker is attempting to load function_app.py")

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# --- function_app.py (Updated Global Section) ---
# Set globals to None
cosmos_client = None
database = None
user_container = None

def get_container():
    global cosmos_client, database, user_container
    if user_container is None:
        # Fails safely at runtime, not deployment time
        COSMOS_CON_STR = os.environ["COSMOS_CONNECTION_STRING"] 
        cosmos_client = CosmosClient.from_connection_string(COSMOS_CON_STR)
        database = cosmos_client.get_database_client("UserDB")
        user_container = database.get_container_client("User")
    return user_container

# --- REGISTRATION ENDPOINT ---
@app.route(route="register", methods=["POST"])
def register_user(req: func.HttpRequest) -> func.HttpResponse:
    try:
        container = get_container()
        req_body = req.get_json()
        email = req_body.get('email')
        password = req_body.get('password')
        name = req_body.get('name')

        if not email or not password:
            return func.HttpResponse("Missing email or password", status_code=400)

        # Hash the password (Data Security Rubric)
        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        user_item = {
            "id": email,  # Using email as unique ID
            "email": email,
            "name": name,
            "password": hashed_password, # Store hash, never plain text
            "auth_type": "local"
        }

        container.create_item(body=user_item)
        return func.HttpResponse(json.dumps({"message": "User registered successfully"}), status_code=201)
    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500)

# --- LOGIN ENDPOINT ---
@app.route(route="login", methods=["POST"])
def login_user(req: func.HttpRequest) -> func.HttpResponse:
    try:
        container = get_container()
        req_body = req.get_json()
        email = req_body.get('email')
        password = req_body.get('password')

        # Find user in Cosmos DB
        user = container.read_item(item=email, partition_key=email)
        
        # Verify Password
        if bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
            # In a real app, you'd return a JWT token here
            return func.HttpResponse(json.dumps({
                "message": "Login successful",
                "user": {"name": user['name'], "email": user['email']}
            }), status_code=200)
        else:
            return func.HttpResponse("Invalid credentials", status_code=401)
            
    except Exception:
        return func.HttpResponse("User not found or login failed", status_code=401)
    
@app.route(route="data_analysis")
def diet_analysis_handler(req: func.HttpRequest) -> func.HttpResponse:
    start_time = time.time()

    try:
        container = get_container()
        
        # Instantly fetch the pre-calculated math from the Blob Trigger
        cached_data = container.read_item(item="latest_averages", partition_key="latest_averages")
        
        execution_time = time.time() - start_time
        
        response_payload = {
            "insights": cached_data.get("data", {}),
            "metadata": {
                "execution_time": f"{execution_time:.4f}s",
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "status": "Served from Cosmos DB Cache"
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

# --- DATA INTERACTION ENDPOINT ---
@app.route(route="recipes/search", methods=["GET"])
def search_recipes(req: func.HttpRequest) -> func.HttpResponse:
    # Get parameters from URL (e.g., ?diet=Vegan&keyword=Tofu&page=1)
    diet_type = req.params.get('diet')
    keyword = req.params.get('keyword')
    page = int(req.params.get('page', 1))

    try:
        # ADD THESE TWO LINES: Re-initialize the client inside this function's scope
        connection_string = os.environ["AZURE_STORAGE_CONNECTION_STRING"]
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)

        # NOTE: Using All_Diets.csv until you build your Blob Trigger!
        blob_client = blob_service_client.get_blob_client(container="datasets", blob="All_Diets.csv")
        data = blob_client.download_blob().readall()
        df = pd.read_csv(io.BytesIO(data))

        # Use the interaction logic
        result = get_paginated_data(df, diet_type, keyword, page)

        return func.HttpResponse(
            body=json.dumps(result),
            mimetype="application/json",
            status_code=200
        )
    except Exception as e:
        return func.HttpResponse(f"Error: {str(e)}", status_code=500)
    
    
@app.blob_trigger(arg_name="myblob", path="datasets/All_Diets.csv", connection="AZURE_STORAGE_CONNECTION_STRING")
def process_dataset_on_upload(myblob: func.InputStream):
    logging.info(f"Blob trigger fired for: {myblob.name}")
    
    try:
        # 1. Read the raw data triggered by the upload
        df = pd.read_csv(io.BytesIO(myblob.read()))
        
        # 2. Clean the data (Fill NAs, etc.)
        df.fillna(df.mean(numeric_only=True), inplace=True)
        
        # 3. Calculate averages
        avg_macros = df.groupby('Diet_type')[['Protein(g)', 'Carbs(g)', 'Fat(g)']].mean().to_dict(orient='index')
        
        # 4. Save the results to Cosmos DB Cache
        container = get_container()
        cache_item = {
            "id": "latest_averages", # Hardcoded ID so it always overwrites the cache
            "data": avg_macros,
            "auth_type": "system_cache" # Satisfies any partition key constraints if needed
        }
        container.upsert_item(body=cache_item)
        logging.info("Successfully updated Cosmos DB cache.")

        # 5. Save "Clean_Diets.csv" back to Blob Storage for the search API
        connection_string = os.environ["AZURE_STORAGE_CONNECTION_STRING"]
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        clean_blob_client = blob_service_client.get_blob_client(container="datasets", blob="Clean_Diets.csv")
        
        # Convert dataframe back to CSV and upload
        clean_csv_data = df.to_csv(index=False).encode('utf-8')
        clean_blob_client.upload_blob(clean_csv_data, overwrite=True)
        logging.info("Successfully generated Clean_Diets.csv.")

    except Exception as e:
        logging.error(f"Error processing blob: {str(e)}")
