import pandas as pd
import json

json_file_path = 'results.json'
output_excel_path = 'result.xlsx'

with open(json_file_path, 'r') as file:
    data = json.load(file)

rows = []
for student in data:
    student_row = {
        'roll_no': student['roll_no'],
        'name': student['name'],
        'sgpa': student['sgpa'],
        'cgpa': student['cgpa']
    }
    
    for subject in student.get('subjects_and_grades', []):
        subject_name = subject['subject']
        grade = subject['grade']
        student_row[subject_name] = grade

    rows.append(student_row)

df = pd.DataFrame(rows)

df.fillna('', inplace=True)

df.to_excel(output_excel_path, index=False)

print(f'Excel file created successfully: {output_excel_path}')
