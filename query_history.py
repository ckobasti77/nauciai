import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')

def main():
    conn = sqlite3.connect('History')
    cursor = conn.cursor()
    
    query = """
    SELECT url, title, datetime(last_visit_time/1000000 - 11644473600, 'unixepoch', 'localtime') as last_visit
    FROM urls 
    WHERE url LIKE '%console.cloud.google.com%' 
       OR url LIKE '%developer.apple.com%'
       OR url LIKE '%credentials%'
       OR url LIKE '%client%'
    ORDER BY last_visit_time DESC
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    print(f"Found {len(rows)} matching history records.")
    for row in rows[:50]:
        print(f"URL: {row[0]}\nTITLE: {row[1]}\nTIME: {row[2]}\n" + "-"*50)
    conn.close()

if __name__ == '__main__':
    main()
