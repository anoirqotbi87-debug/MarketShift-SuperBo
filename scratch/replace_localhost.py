import os
import glob
import re

ui_src = r"c:\Users\Qotbi\Documents\GitHub\MarketShift-SuperBot\ui\src"
files = glob.glob(os.path.join(ui_src, "**", "*.tsx"), recursive=True) + glob.glob(os.path.join(ui_src, "**", "*.ts"), recursive=True)

target_str = "http://${window.location.hostname}:8000"
import_statement = "import { getApiBaseUrl } from '../utils/api';" # Will adjust relative path if needed

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if target_str in content:
        # Calculate relative path to src/utils/api
        dir_path = os.path.dirname(filepath)
        rel_to_src = os.path.relpath(ui_src, dir_path)
        import_path = os.path.join(rel_to_src, "utils/api").replace("\\", "/")
        if not import_path.startswith('.'):
            import_path = "./" + import_path
            
        import_stmt = f"import {{ getApiBaseUrl }} from '{import_path}';\n"
        
        # Add import at the top (after other imports)
        if "getApiBaseUrl" not in content:
            lines = content.split('\n')
            last_import = -1
            for i, line in enumerate(lines):
                if line.startswith('import '):
                    last_import = i
            
            if last_import != -1:
                lines.insert(last_import + 1, import_stmt.strip())
            else:
                lines.insert(0, import_stmt.strip())
            content = '\n'.join(lines)
            
        # Replace the target
        content = content.replace("`" + target_str, "`${getApiBaseUrl()}")
        content = content.replace("'" + target_str + "'", "getApiBaseUrl()")
        content = content.replace('"' + target_str + '"', "getApiBaseUrl()")
        
        # Also replace instances like `http://${window.location.hostname}:8000/something`
        # which are now `${getApiBaseUrl()}/something`
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")
