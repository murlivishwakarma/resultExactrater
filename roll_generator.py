import json

def generate_roll_numbers(base_roll, count):
    return [{"enroll": f"{base_roll}{i:03d}"} for i in range(1, count + 1)]

base_roll = input("Enter base enrollment in format (InstituteCode Branch Code Year [ex - 0103IS221]): ")
count = int(input("Enter total number of students : "))

roll_numbers = generate_roll_numbers(base_roll, count)

with open("roll_numbers.json", "w") as f:
    f.write("[\n")
    for i, roll in enumerate(roll_numbers):
        json.dump(roll, f)
        f.write("," if i < len(roll_numbers) - 1 else "")
        f.write("\n")
    f.write("]\n")
