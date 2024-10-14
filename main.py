# main.py

# Importing necessary functions and modules from your files
from rgpv_scraper import start_scraping  # Assuming this starts the scraping process
from roll_generator import generate_roll_numbers
from JSON_excel_converter import convert_json_to_excel
from rgpv_xpath import course_click_xp  # Assuming it provides XPaths needed for scraping

def main():
    # Step 1: Generate roll numbers
    generate_roll_numbers()

    # Step 2: Start the scraping process and fetch results
    print("Starting RGPV result scraping...")
    start_scraping()

    # Step 3: Convert the JSON result file to an Excel file
    print("Converting results to Excel...")
    convert_json_to_excel()

    print("Process completed. Results saved in result.xlsx.")

if __name__ == "__main__":
    main()
