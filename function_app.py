import azure.functions as func
import os
import json
import bcrypt
from azure.cosmos import CosmosClient, PartitionKey
from azure.blob.storage import BlobServiceClient
from interaction_logic import get_paginated_data

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Cosmos DB Setup
COSMOS_CON_STR = os.environ.get("COSMOS_CONNECTION_STRING")
client = CosmosClient.from_connection_string(COSMOS_CON_STR)
database = client.get_database_client("UserDB")
container = database.get_container_client("Users")

# --- REGISTRATION ENDPOINT ---
@app.route(route="register", methods=["POST"])
def register_user(req: func.HttpRequest) -> func.HttpResponse:
    try:
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

# --- DATA INTERACTION ENDPOINT ---
@app.route(route="recipes/search", methods=["GET"])
def search_recipes(req: func.HttpRequest) -> func.HttpResponse:
    # Get parameters from URL (e.g., ?diet=Vegan&keyword=Tofu&page=1)
    diet_type = req.params.get('diet')
    keyword = req.params.get('keyword')
    page = int(req.params.get('page', 1))

    try:
        # PERFORMANCE: Load the 'Clean' file, not the raw one
        blob_client = blob_service_client.get_blob_client(container="datasets", blob="Clean_Diets.csv")
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
