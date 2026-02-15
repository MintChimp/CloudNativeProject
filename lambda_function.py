import pandas as pd
import io
import json
import os
from azure.storage.blob import BlobServiceClient

def process_nutritional_data_from_azurite():
    # Connection string for local Azurite emulator
    connect_str = (
        "DefaultEndpointsProtocol=http;"
        "AccountName=devstoreaccount1;"
        "AccountKey=Eby8vdM02xNOcqFeqCnrC4xF6iCImP2U19x86766X676Gdxadvn6EDbhededed=="
        ";BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
    )
    
    try:
        blob_service_client = BlobServiceClient.from_connection_string(connect_str)
        
        container_name = 'datasets'
        blob_name = 'All_Diets.csv'

        # Access container and blob
        container_client = blob_service_client.get_container_client(container_name)
        blob_client = container_client.get_blob_client(blob_name)

        print(f"Downloading {blob_name} from Azurite...")
        stream = blob_client.download_blob().readall()
        df = pd.read_csv(io.BytesIO(stream))

        # Calculate averages as required
        avg_macros = df.groupby('Diet_type')[['Protein(g)', 'Carbs(g)', 'Fat(g)']].mean()

        # Simulate NoSQL storage by saving to a local JSON file
        # Create directory if it doesn't exist
        os.makedirs('simulated_nosql', exist_ok=True)
        
        result = avg_macros.reset_index().to_dict(orient='records')
        output_path = 'simulated_nosql/results.json'
        
        with open(output_path, 'w') as f:
            json.dump(result, f, indent=4)

        return f"Success: Data processed and stored in {output_path}"

    except Exception as e:
        return f"Error: {str(e)}"

if __name__ == "__main__":
    # Ensure Azurite is running before executing this
    status = process_nutritional_data_from_azurite()
    print(status)