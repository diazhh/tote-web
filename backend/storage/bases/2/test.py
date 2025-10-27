from PIL import Image
import os

# Obtener el directorio actual
current_dir = os.getcwd()

# Extensiones de archivos de imagen que se buscarán
image_extensions = ('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tiff', '.webp')

# Recorrer los archivos en el directorio actual
for file_name in os.listdir(current_dir):
    if file_name.lower().endswith(image_extensions):
        try:
            # Abrir la imagen
            image_path = os.path.join(current_dir, file_name)
            with Image.open(image_path) as img:
                width, height = img.size
                print(f"Imagen: {file_name} - Dimensiones: {width}x{height}")
        except Exception as e:
            print(f"Error al procesar {file_name}: {e}")
