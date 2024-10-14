import time
import json
import os
from io import BytesIO
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoAlertPresentException 
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.alert import Alert
import easyocr
from PIL import Image
import requests
from bs4 import BeautifulSoup
from rgpv_xpath import *

def getWeb():
    global driver
    options = Options() 
    options.add_argument("-headless")
    driver = webdriver.Firefox(options=options)
    driver.get('http://result.rgpv.ac.in/Result/ProgramSelect.aspx')
    btech_click = driver.find_element(By.XPATH, course_click_xp).click()

def detailsInput(enroll_no):
    enroll_input = driver.find_element(By.XPATH, enroll_xp)
    enroll_input.clear()  # Clear any existing input
    enroll_input.send_keys(enroll_no)

    sem_ddn = driver.find_element(By.XPATH, sem_ddn_xp).click()
    sem_sel = driver.find_element(By.XPATH, sem_sel_xp).click()

def captchaConfig():
    retry = True
    while retry:
        captcha = driver.find_element(By.XPATH, captcha_xp)
        captcha_url = captcha.get_attribute('src')
        response = requests.get(captcha_url)

        captcha_img = Image.open(BytesIO(response.content))  
        reader = easyocr.Reader(['en'])
        result = reader.readtext(captcha_img)

        captcha_text = ' '.join([item[1] for item in result]) 
        captcha_final = captcha_text.replace(' ', '')
        captcha_input = driver.find_element(By.XPATH, captcha_input_xp)
        captcha_input.send_keys(Keys.CONTROL + 'a')  
        captcha_input.send_keys(Keys.BACKSPACE)
        captcha_input.send_keys(captcha_final)
        time.sleep(3)
        submit_info = driver.find_element(By.XPATH, submit_xp).click()

        try: 
            alert = driver.switch_to.alert
            alert_message = alert.text
            
            if alert_message == 'you have entered a wrong text':
                alert.accept()
                retry = True
            elif alert_message == 'Result for this Enrollment No. not Found':
                alert.accept()
                reset = driver.find_element(By.XPATH, reset_xp).click()
                return False
        
        except NoAlertPresentException:
            retry = False
    
    return True

def load_results(filename='results.json'):
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            return json.load(f)
    return []

def save_result(result, filename='results.json'):
    results = load_results(filename)
    results.append(result)
    with open(filename, 'w') as f:
        json.dump(results, f, indent=2)

def resultExt(enroll_no):
    html_content = driver.page_source
    soup = BeautifulSoup(html_content, 'html.parser')

    name = soup.find('span', {'id': name_id}).text.strip()
    roll_no = soup.find('span', {'id': roll_no_id}).text.strip()
    sgpa = soup.find('span', {'id': sgpa_id}).text.strip()
    cgpa = soup.find('span', {'id': cgpa_id}).text.strip()

    subjects_and_grades = []
    subject_tables = soup.find_all('table', class_='gridtable', style='width:100%')

    for table in subject_tables:
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) == 4:
                subject = cells[0].text.strip()
                grade = cells[3].text.strip()
                subjects_and_grades.append({"subject": subject, "grade": grade})

    result = {
        "name": name,
        "roll_no": roll_no,
        "sgpa": sgpa,
        "cgpa": cgpa,
        "subjects_and_grades": subjects_and_grades
    }

    save_result(result)
    
    reset = driver.find_element(By.XPATH, reset_xp).click()

def processEnroll():
    with open('roll_numbers.json', 'r') as file:
        data = json.load(file)

    for entry in data:
        enroll_no = entry['enroll']
        try:
            detailsInput(enroll_no)
            if captchaConfig():
                resultExt(enroll_no)
            else:
                print(f"Result not found for enrollment number: {enroll_no}")
        except Exception as e:
            print(f"Error processing enrollment number {enroll_no}: {str(e)}")
            continue

if __name__ == "__main__":
    try:
        getWeb()
        processEnroll()
    except Exception as e:
        print(f"An error occurred: {str(e)}")
    finally:
        if 'driver' in globals():
            driver.quit()
        print("Script execution completed. Check results.json for the extracted data.")
