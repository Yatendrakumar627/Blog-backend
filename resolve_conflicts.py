import os

def resolve_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Skipping binary or unreadable file: {filepath}")
        return

    new_lines = []
    mode = 'normal' # normal, inside_head, inside_incoming
    modified = False

    for line in lines:
        if line.strip().startswith('<<<<<<< HEAD'):
            mode = 'inside_head'
            modified = True
            continue 
        
        if line.strip().startswith('======='):
            if mode == 'inside_head':
                mode = 'inside_incoming'
            else:
                 # Unexpected marker, treat as normal line? Or maybe nested.
                 # For safety, if we aren't in HEAD, we ignore it? 
                 # But conflict markers usually come in pairs.
                 # Let's assume standard git output.
                 pass
            continue

        if line.strip().startswith('>>>>>>>'):
            if mode == 'inside_incoming':
                mode = 'normal'
            else:
                mode = 'normal'
            continue

        if mode == 'normal':
            new_lines.append(line)
        elif mode == 'inside_head':
            new_lines.append(line)
        elif mode == 'inside_incoming':
            pass # Skip incoming lines

    if modified:
        print(f"Resolving conflicts in: {filepath}")
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)

def main():
    root_dir = r"C:\Users\pc\Desktop\Blog\server"
    for subdir, dirs, files in os.walk(root_dir):
        if 'node_modules' in subdir or '.git' in subdir:
            continue
        for file in files:
            # Skip this script itself
            if file == 'resolve_conflicts.py':
                continue
            
            filepath = os.path.join(subdir, file)
            resolve_file(filepath)
    print("Conflict resolution complete.")

if __name__ == "__main__":
    main()
