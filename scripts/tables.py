# Reconstruct the table from the list
def rebuild_table(table):
    table_text = ""
    for row in table:
        # Hacky way to avoid double || at the end
        for column in row[1:]:
            table_text +=  "|" + column
        table_text += "\n"
    return table_text

# Transform table text to a 2d list
def parse_table(md_content):
    table = []
    lines = md_content.splitlines()
    # We only care about the table
    for line in lines:
        if line.startswith('|'):
            row = line.split('|')
            table.append(row)
    return table

def copy_column(_source_table_, _dest_table_, _matching_columns=(1,1), _update_columns_=(5,5)):
    new_table = _dest_table_
    n_source_rows = len(_source_table_)
    n_dest_rows = len(_dest_table_)
    # Skip headers and separators
    source_row_index = 2
    for dest_row_index in range(2,n_dest_rows):
        if (source_row_index < n_source_rows):
            if _source_table_[source_row_index][_matching_columns[0]].strip() == _source_table_[source_row_index][_matching_columns[1]].strip():
                new_table[dest_row_index][_update_columns_[1]]= _source_table_[source_row_index][_update_columns_[0]]
            source_row_index += 1
    return new_table



# Honestly I need to automate this, but doing it was faster in the momement
source_path = 'src/01-gear/01-ware/lists/alphabetical.md'
dest_path = 'src/01-gear/01-ware/lists/synthmorphs.md'
matching_columns = (1,1)
update_columns = (5,5)

with open(source_path,'r') as source_file:
    source = source_file.read()
source_table = parse_table(source)

with open(dest_path,'r') as dest_fiile:
    destination = dest_fiile.read()
dest_table = parse_table(destination)


#new_table = copy_column(source_table,dest_table,matching_columns,update_columns)
#print(rebuild_table(new_table))
