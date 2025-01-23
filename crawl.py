import os
import json

def create_file_data(directory: str) -> str:
    """
    Recursively iterates through the directory, reading file contents and creating
    a JSON string in the specified FileData format.
    """
    file_data = {}

    for root, _, files in os.walk(directory):
        for file_name in files:
            file_path = os.path.join(root, file_name)
            relative_path = os.path.relpath(file_path, directory)

            try:
                with open(file_path, 'r', encoding='utf-8') as file:
                    content = file.read()
                file_data[relative_path] = content
            except Exception as e:
                print(f"Could not read {file_path}: {e}")

    # Generate a pretty-printed JSON string
    json_string = json.dumps(file_data, indent=2)
    return json_string

def write_json_to_file(output_path: str, json_data: str) -> None:
    """
    Writes the JSON string to the specified file.
    """
    try:
        with open(output_path, 'w', encoding='utf-8') as file:
            file.write(json_data)
        print(f"JSON data written successfully to {output_path}.")
    except Exception as e:
        print(f"Could not write to {output_path}: {e}")

if __name__ == "__main__":
    # Replace with the actual paths
    directory = '/tmp/a'
    output_file_path = './public/data.json'

    # Generate JSON data and write to file
    json_data = create_file_data(directory)
    write_json_to_file(output_file_path, json_data)
