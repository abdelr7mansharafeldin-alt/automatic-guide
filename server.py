import http.server
import socketserver
import json
import sqlite3
import urllib.parse
import os
import sys
import shutil
from datetime import datetime

PORT = 5000
DB_FILE = 'database.db'
BACKUP_DIR = 'backups'

# Ensure directories exist
if not os.path.exists(BACKUP_DIR):
    os.makedirs(BACKUP_DIR)

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Users / Employees Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL, -- admin, employee
        permissions TEXT NOT NULL, -- JSON string
        status TEXT NOT NULL DEFAULT 'active' -- active, inactive
    )
    ''')
    
    # 2. Login History Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS login_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        login_time TEXT NOT NULL,
        ip_address TEXT
    )
    ''')
    
    # 3. Cash Accounts Table (Vodafone / Orange / Etisalat / WE)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone_number TEXT UNIQUE NOT NULL,
        wallet_number TEXT NOT NULL,
        network_type TEXT NOT NULL DEFAULT 'vodafone', -- vodafone, orange, etisalat, we
        current_balance REAL NOT NULL DEFAULT 0.0,
        daily_balance REAL NOT NULL DEFAULT 0.0,
        status TEXT NOT NULL DEFAULT 'active', -- active, inactive
        notes TEXT
    )
    ''')
    # Add network_type column if it doesn't exist (for existing databases)
    try:
        cursor.execute("ALTER TABLE accounts ADD COLUMN network_type TEXT NOT NULL DEFAULT 'vodafone'")
    except Exception:
        pass
    
    # 4. Operations Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_number TEXT UNIQUE NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        user_id INTEGER,
        employee_name TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        account_id INTEGER,
        account_name TEXT NOT NULL,
        operation_type TEXT NOT NULL, -- withdrawal, deposit, transfer, inquiry, bill_payment
        amount REAL NOT NULL,
        commission REAL NOT NULL DEFAULT 0.0,
        notes TEXT
    )
    ''')
    
    # 5. Daily Closings Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS daily_closings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        opening_balance REAL NOT NULL,
        closing_balance REAL NOT NULL,
        operations_count INTEGER NOT NULL,
        commission REAL NOT NULL,
        profit REAL NOT NULL,
        cash_difference REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'closed', -- open, closed
        notes TEXT
    )
    ''')
    
    # 6. Settings Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    ''')
    
    # Check if admin exists, if not seed it
    cursor.execute("SELECT * FROM users WHERE username = 'admin'")
    if not cursor.fetchone():
        cursor.execute('''
        INSERT INTO users (username, name, password, role, permissions, status)
        VALUES ('admin', 'المدير العام', 'admin12345', 'admin', '{"can_delete":true,"can_edit":true,"can_backup":true,"can_manage_users":true}', 'active')
        ''')
    
    # Seed 20 Cash Accounts if empty (5 per network)
    cursor.execute("SELECT COUNT(*) FROM accounts")
    if cursor.fetchone()[0] == 0:
        initial_accounts = [
            # Vodafone Cash (5 accounts)
            ("فودافون رئيسي 1", "01001234501", "01001234501", "vodafone", 15000.0, 15000.0, "active", "الحساب الرئيسي الأول للسنترال"),
            ("فودافون فرعي 2", "01001234502", "01001234502", "vodafone", 8500.0, 8500.0, "active", "حساب السحوبات اليومية"),
            ("فودافون محفظة 3", "01001234503", "01001234503", "vodafone", 12000.0, 12000.0, "active", "للإيداعات الكبيرة"),
            ("فودافون محفظة 4", "01001234504", "01001234504", "vodafone", 5000.0, 5000.0, "active", ""),
            ("فودافون احتياطي 5", "01001234505", "01001234505", "vodafone", 25000.0, 25000.0, "active", "محفظة احتياطية للتحويلات الكبيرة"),
            # Orange Cash (5 accounts)
            ("أورنج رئيسي 1", "01201234501", "01201234501", "orange", 10000.0, 10000.0, "active", "حساب أورنج كاش الأساسي"),
            ("أورنج فرعي 2", "01201234502", "01201234502", "orange", 6500.0, 6500.0, "active", ""),
            ("أورنج محفظة 3", "01201234503", "01201234503", "orange", 8000.0, 8000.0, "active", ""),
            ("أورنج محفظة 4", "01201234504", "01201234504", "orange", 3500.0, 3500.0, "active", ""),
            ("أورنج احتياطي 5", "01201234505", "01201234505", "orange", 18000.0, 18000.0, "active", "للتحويلات الكبيرة"),
            # Etisalat Cash (5 accounts)
            ("اتصالات رئيسي 1", "01501234501", "01501234501", "etisalat", 9000.0, 9000.0, "active", "حساب اتصالات كاش الأساسي"),
            ("اتصالات فرعي 2", "01501234502", "01501234502", "etisalat", 4500.0, 4500.0, "active", ""),
            ("اتصالات محفظة 3", "01501234503", "01501234503", "etisalat", 7200.0, 7200.0, "active", ""),
            ("اتصالات محفظة 4", "01501234504", "01501234504", "etisalat", 2800.0, 2800.0, "active", ""),
            ("اتصالات احتياطي 5", "01501234505", "01501234505", "etisalat", 15000.0, 15000.0, "active", "احتياطي"),
            # WE Cash (5 accounts)
            ("WE رئيسي 1", "01101234501", "01101234501", "we", 7000.0, 7000.0, "active", "حساب WE كاش الأساسي"),
            ("WE فرعي 2", "01101234502", "01101234502", "we", 3500.0, 3500.0, "active", ""),
            ("WE محفظة 3", "01101234503", "01101234503", "we", 5500.0, 5500.0, "active", ""),
            ("WE محفظة 4", "01101234504", "01101234504", "we", 2000.0, 2000.0, "active", ""),
            ("WE احتياطي 5", "01101234505", "01101234505", "we", 12000.0, 12000.0, "active", "احتياطي"),
        ]
        cursor.executemany('''
        INSERT INTO accounts (name, phone_number, wallet_number, network_type, current_balance, daily_balance, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', initial_accounts)
        
    # Seed Settings if empty
    cursor.execute("SELECT COUNT(*) FROM settings")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO settings (key, value) VALUES ('shop_name', 'سنترال شرف الدين')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('theme', 'light')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('backup_folder', 'backups')")
        cursor.execute("INSERT INTO settings (key, value) VALUES ('logo_url', '')")
        
    conn.commit()
    conn.close()

class CustomAPIHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()
        
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()
        
    def write_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        response_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_header('Content-Length', str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        
        # API Routes
        if path.startswith('/api/'):
            self.handle_api_get(path, query)
        else:
            # Static file serving
            self.handle_static_file(path)
            
    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        if path.startswith('/api/'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            try:
                data = json.loads(post_data)
            except json.JSONDecodeError:
                data = {}
            self.handle_api_post(path, data)
        else:
            self.write_json_response(404, {"error": "Not Found"})

    def do_PUT(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        if path.startswith('/api/'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            try:
                data = json.loads(post_data)
            except json.JSONDecodeError:
                data = {}
            self.handle_api_put(path, data)
        else:
            self.write_json_response(404, {"error": "Not Found"})

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        
        if path.startswith('/api/'):
            self.handle_api_delete(path, query)
        else:
            self.write_json_response(404, {"error": "Not Found"})

    def handle_static_file(self, path):
        # Normalize path
        if path == '/' or path == '':
            path = '/index.html'
        
        # Remove leading slash
        file_path = path.lstrip('/')
        
        # Prevent directory traversal
        abs_file_path = os.path.abspath(file_path)
        abs_workspace = os.path.abspath('.')
        if not abs_file_path.startswith(abs_workspace):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"Forbidden")
            return
            
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File Not Found")
            return
            
        # Determine content type
        content_type = 'text/plain'
        if file_path.endswith('.html'):
            content_type = 'text/html; charset=utf-8'
        elif file_path.endswith('.css'):
            content_type = 'text/css; charset=utf-8'
        elif file_path.endswith('.js'):
            content_type = 'application/javascript; charset=utf-8'
        elif file_path.endswith('.png'):
            content_type = 'image/png'
        elif file_path.endswith('.jpg') or file_path.endswith('.jpeg'):
            content_type = 'image/jpeg'
        elif file_path.endswith('.ico'):
            content_type = 'image/x-icon'
        elif file_path.endswith('.json'):
            content_type = 'application/json'
            
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        
        # Read and serve file
        with open(file_path, 'rb') as f:
            content = f.read()
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

    # =========================================================================
    # API GET REQUESTS
    # =========================================================================
    def handle_api_get(self, path, query):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            if path == '/api/dashboard':
                # Today's operations count, today's total commission, today's total profit
                today_str = datetime.now().strftime('%Y-%m-%d')
                
                # Today Operations Count and sums
                cursor.execute("""
                    SELECT COUNT(*) as count, SUM(amount) as total_amount, SUM(commission) as total_commission
                    FROM operations 
                    WHERE date = ?
                """, (today_str,))
                today_stats = cursor.fetchone()
                
                today_count = today_stats['count'] or 0
                today_amount = today_stats['total_amount'] or 0.0
                today_commission = today_stats['total_commission'] or 0.0
                
                # Commission calculations (Today's, Monthly, Yearly)
                current_month = datetime.now().strftime('%Y-%m')
                current_year = datetime.now().strftime('%Y')
                
                cursor.execute("SELECT SUM(commission) as comm FROM operations WHERE date LIKE ?", (f"{current_month}-%",))
                month_comm = cursor.fetchone()['comm'] or 0.0
                
                cursor.execute("SELECT SUM(commission) as comm FROM operations WHERE date LIKE ?", (f"{current_year}-%",))
                year_comm = cursor.fetchone()['comm'] or 0.0
                
                # Total Cash (Sum of balances of all active accounts)
                cursor.execute("SELECT SUM(current_balance) as total_balance, COUNT(*) as count FROM accounts WHERE status = 'active'")
                accounts_stats = cursor.fetchone()
                current_cash = accounts_stats['total_balance'] or 0.0
                active_accounts_count = accounts_stats['count'] or 0
                
                # Top Employee today
                cursor.execute("""
                    SELECT employee_name, COUNT(*) as op_count 
                    FROM operations 
                    WHERE date = ? 
                    GROUP BY employee_name 
                    ORDER BY op_count DESC 
                    LIMIT 1
                """, (today_str,))
                top_emp_row = cursor.fetchone()
                top_employee = top_emp_row['employee_name'] if top_emp_row else "لا يوجد"
                
                # Recent Operations (last 10)
                cursor.execute("""
                    SELECT id, operation_number, date, time, employee_name, customer_name, customer_phone, 
                           account_name, operation_type, amount, commission, notes
                    FROM operations
                    ORDER BY id DESC LIMIT 10
                """)
                recent_ops = [dict(row) for row in cursor.fetchall()]
                
                # Daily Operations Chart data (last 7 days)
                # We'll generate the last 7 days including today
                import datetime as dt
                chart_days = []
                chart_op_counts = []
                chart_profits = []
                for i in range(6, -1, -1):
                    day = (dt.date.today() - dt.timedelta(days=i)).strftime('%Y-%m-%d')
                    chart_days.append(day)
                    
                    cursor.execute("SELECT COUNT(*) as count, SUM(commission) as profit FROM operations WHERE date = ?", (day,))
                    row = cursor.fetchone()
                    chart_op_counts.append(row['count'] or 0)
                    chart_profits.append(row['profit'] or 0.0)
                
                # Monthly Profit Chart data (last 6 months)
                chart_months = []
                chart_monthly_profits = []
                for i in range(5, -1, -1):
                    # Simple month back calculation
                    d = dt.date.today()
                    # subtract months
                    for _ in range(i):
                        d = (d.replace(day=1) - dt.timedelta(days=1))
                    month_str = d.strftime('%Y-%m')
                    chart_months.append(month_str)
                    
                    cursor.execute("SELECT SUM(commission) as profit FROM operations WHERE date LIKE ?", (f"{month_str}-%",))
                    row = cursor.fetchone()
                    chart_monthly_profits.append(row['profit'] or 0.0)
                
                dashboard_data = {
                    "today_operations": today_count,
                    "today_commission": today_commission,
                    "today_profit": today_commission, # Commission is the profit in this system
                    "current_cash": current_cash,
                    "accounts_count": active_accounts_count,
                    "top_employee": top_employee,
                    "recent_operations": recent_ops,
                    "charts": {
                        "daily_ops": {
                            "labels": chart_days,
                            "counts": chart_op_counts,
                            "profits": chart_profits
                        },
                        "monthly_profit": {
                            "labels": chart_months,
                            "profits": chart_monthly_profits
                        }
                    }
                }
                self.write_json_response(200, dashboard_data)
                
            elif path == '/api/accounts':
                cursor.execute("SELECT * FROM accounts ORDER BY id ASC")
                accounts = [dict(row) for row in cursor.fetchall()]
                self.write_json_response(200, accounts)
                
            elif path == '/api/operations':
                # Filter/Search Query params
                search_query = query.get('q', [''])[0]
                date_filter = query.get('date', [''])[0]
                employee_filter = query.get('employee', [''])[0]
                account_filter = query.get('account', [''])[0]
                op_type_filter = query.get('type', [''])[0]
                
                sql = "SELECT * FROM operations WHERE 1=1"
                params = []
                
                if search_query:
                    sql += " AND (customer_name LIKE ? OR customer_phone LIKE ? OR operation_number LIKE ? OR employee_name LIKE ? OR notes LIKE ? OR amount = ?)"
                    q_param = f"%{search_query}%"
                    params.extend([q_param, q_param, q_param, q_param, q_param, search_query])
                if date_filter:
                    sql += " AND date = ?"
                    params.append(date_filter)
                if employee_filter:
                    sql += " AND employee_name = ?"
                    params.append(employee_filter)
                if account_filter:
                    sql += " AND account_id = ?"
                    params.append(int(account_filter))
                if op_type_filter:
                    sql += " AND operation_type = ?"
                    params.append(op_type_filter)
                    
                sql += " ORDER BY id DESC"
                
                cursor.execute(sql, params)
                operations = [dict(row) for row in cursor.fetchall()]
                self.write_json_response(200, operations)
                
            elif path == '/api/employees':
                cursor.execute("SELECT id, username, name, role, permissions, status FROM users ORDER BY id ASC")
                users = []
                for row in cursor.fetchall():
                    user_dict = dict(row)
                    user_dict['permissions'] = json.loads(user_dict['permissions'])
                    users.append(user_dict)
                self.write_json_response(200, users)
                
            elif path == '/api/login/history':
                cursor.execute("SELECT * FROM login_history ORDER BY id DESC LIMIT 50")
                history = [dict(row) for row in cursor.fetchall()]
                self.write_json_response(200, history)
                
            elif path == '/api/settings':
                cursor.execute("SELECT * FROM settings")
                settings_dict = {}
                for row in cursor.fetchall():
                    settings_dict[row['key']] = row['value']
                self.write_json_response(200, settings_dict)
                
            elif path == '/api/backup/list':
                try:
                    files = [f for f in os.listdir(BACKUP_DIR) if f.endswith('.db')]
                    files.sort(reverse=True)
                    self.write_json_response(200, files)
                except Exception as e:
                    self.write_json_response(500, {"error": str(e)})
                
            elif path == '/api/reports':
                report_type = query.get('type', ['daily'])[0] # daily, weekly, monthly, yearly, custom
                start_date = query.get('start_date', [''])[0]
                end_date = query.get('end_date', [''])[0]
                
                import datetime as dt
                today = dt.date.today()
                
                if report_type == 'daily':
                    date_clause = "date = ?"
                    params = [today.strftime('%Y-%m-%d')]
                elif report_type == 'weekly':
                    # Last 7 days
                    start = (today - dt.timedelta(days=7)).strftime('%Y-%m-%d')
                    date_clause = "date BETWEEN ? AND ?"
                    params = [start, today.strftime('%Y-%m-%d')]
                elif report_type == 'monthly':
                    current_month = today.strftime('%Y-%m')
                    date_clause = "date LIKE ?"
                    params = [f"{current_month}-%"]
                elif report_type == 'yearly':
                    current_year = today.strftime('%Y')
                    date_clause = "date LIKE ?"
                    params = [f"{current_year}-%"]
                elif report_type == 'custom':
                    date_clause = "date BETWEEN ? AND ?"
                    params = [start_date, end_date]
                else:
                    date_clause = "1=1"
                    params = []
                    
                # 1. Base operations stats
                cursor.execute(f"""
                    SELECT COUNT(*) as count, SUM(amount) as total_amount, SUM(commission) as total_commission
                    FROM operations
                    WHERE {date_clause}
                """, params)
                summary_row = cursor.fetchone()
                total_ops = summary_row['count'] or 0
                total_amount = summary_row['total_amount'] or 0.0
                total_commission = summary_row['total_commission'] or 0.0
                profit = total_commission # Commission is the profit
                
                # 2. Employee Statistics
                cursor.execute(f"""
                    SELECT employee_name, COUNT(*) as count, SUM(amount) as total_amount, SUM(commission) as total_commission
                    FROM operations
                    WHERE {date_clause}
                    GROUP BY employee_name
                    ORDER BY total_commission DESC
                """, params)
                employee_stats = [dict(row) for row in cursor.fetchall()]
                
                # 3. Vodafone Account Statistics
                cursor.execute(f"""
                    SELECT account_name, COUNT(*) as count, SUM(amount) as total_amount, SUM(commission) as total_commission
                    FROM operations
                    WHERE {date_clause}
                    GROUP BY account_name
                    ORDER BY total_commission DESC
                """, params)
                account_stats = [dict(row) for row in cursor.fetchall()]
                
                # 4. Most active employee
                most_active_employee = "لا يوجد"
                if employee_stats:
                    most_active_employee = employee_stats[0]['employee_name']
                    
                # 5. Top Account
                top_account = "لا يوجد"
                if account_stats:
                    top_account = account_stats[0]['account_name']
                    
                report_data = {
                    "operations_count": total_ops,
                    "total_amount": total_amount,
                    "total_commission": total_commission,
                    "profit": profit,
                    "most_active_employee": most_active_employee,
                    "top_account": top_account,
                    "employee_statistics": employee_stats,
                    "account_statistics": account_stats
                }
                
                self.write_json_response(200, report_data)
                
            elif path == '/api/closing':
                # Get the closing status for today
                today_str = datetime.now().strftime('%Y-%m-%d')
                cursor.execute("SELECT * FROM daily_closings WHERE date = ?", (today_str,))
                row = cursor.fetchone()
                if row:
                    self.write_json_response(200, dict(row))
                else:
                    # Let's calculate today's current stats to show as preview
                    cursor.execute("SELECT COUNT(*) as count, SUM(amount) as total_amount, SUM(commission) as total_commission FROM operations WHERE date = ?", (today_str,))
                    stats = cursor.fetchone()
                    
                    # Calculate opening balance (which is the closing balance of yesterday)
                    import datetime as dt
                    yesterday_str = (dt.date.today() - dt.timedelta(days=1)).strftime('%Y-%m-%d')
                    cursor.execute("SELECT closing_balance FROM daily_closings WHERE date = ?", (yesterday_str,))
                    yest_row = cursor.fetchone()
                    opening = yest_row['closing_balance'] if yest_row else 0.0
                    
                    # Sum of all account balances as potential closing balance
                    cursor.execute("SELECT SUM(current_balance) as balance FROM accounts WHERE status = 'active'")
                    cur_balance = cursor.fetchone()['balance'] or 0.0
                    
                    preview_data = {
                        "date": today_str,
                        "opening_balance": opening,
                        "closing_balance": cur_balance,
                        "operations_count": stats['count'] or 0,
                        "commission": stats['total_commission'] or 0.0,
                        "profit": stats['total_commission'] or 0.0,
                        "cash_difference": 0.0,
                        "status": "open",
                        "notes": ""
                    }
                    self.write_json_response(200, preview_data)
            else:
                self.write_json_response(404, {"error": "Not Found"})
        except Exception as e:
            self.write_json_response(500, {"error": str(e)})
        finally:
            conn.close()

    # =========================================================================
    # API POST REQUESTS
    # =========================================================================
    def handle_api_post(self, path, data):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            if path == '/api/login':
                username = data.get('username')
                password = data.get('password')
                
                cursor.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password))
                user = cursor.fetchone()
                
                if user:
                    user_dict = dict(user)
                    if user_dict['status'] != 'active':
                        self.write_json_response(403, {"error": "هذا الحساب معطل حالياً"})
                        return
                        
                    user_dict['permissions'] = json.loads(user_dict['permissions'])
                    
                    # Log login history
                    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    ip = self.client_address[0]
                    cursor.execute("""
                        INSERT INTO login_history (user_id, username, login_time, ip_address)
                        VALUES (?, ?, ?, ?)
                    """, (user_dict['id'], user_dict['username'], now_str, ip))
                    conn.commit()
                    
                    # Delete password from response
                    del user_dict['password']
                    
                    self.write_json_response(200, {"success": True, "user": user_dict})
                else:
                    self.write_json_response(401, {"error": "اسم المستخدم أو كلمة المرور غير صحيحة"})
                    
            elif path == '/api/accounts':
                name = data.get('name')
                phone_number = data.get('phone_number')
                wallet_number = data.get('wallet_number')
                current_balance = float(data.get('current_balance', 0.0))
                daily_balance = float(data.get('daily_balance', current_balance))
                status = data.get('status', 'active')
                notes = data.get('notes', '')
                
                cursor.execute("""
                    INSERT INTO accounts (name, phone_number, wallet_number, current_balance, daily_balance, status, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (name, phone_number, wallet_number, current_balance, daily_balance, status, notes))
                conn.commit()
                
                self.write_json_response(201, {"success": True, "id": cursor.lastrowid})
                
            elif path == '/api/operations':
                # Create Operation and update account balance!
                employee_name = data.get('employee_name')
                customer_name = data.get('customer_name', '')
                customer_phone = data.get('customer_phone', '')
                account_id = data.get('account_id')
                op_type = data.get('operation_type') # withdrawal, deposit, transfer, inquiry, bill_payment
                amount = float(data.get('amount', 0.0))
                commission = float(data.get('commission', 0.0))
                notes = data.get('notes', '')
                
                # Check for duplicate operation (prevent duplicate submission in 15 seconds)
                now_date = datetime.now().strftime('%Y-%m-%d')
                now_time = datetime.now().strftime('%H:%M:%S')
                
                # Verify account exists
                cursor.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
                account = cursor.fetchone()
                if not account:
                    self.write_json_response(404, {"error": "حساب فودافون كاش غير موجود"})
                    return
                
                # Business logic: Balance check and update
                new_balance = account['current_balance']
                if op_type == 'withdrawal':
                    # Customer withdraws money, so the Vodafone account balance increases
                    new_balance += amount
                elif op_type in ['deposit', 'transfer', 'bill_payment']:
                    # Central deposits money to customer, so Vodafone account balance decreases
                    if account['current_balance'] < amount:
                        self.write_json_response(400, {"error": f"رصيد الحساب غير كافٍ. الرصيد الحالي: {account['current_balance']} جنيه"})
                        return
                    new_balance -= amount
                # Inquiry does not change balance
                
                # Check for duplicate in last 15 seconds with same phone, amount, type, account
                cursor.execute("""
                    SELECT * FROM operations 
                    WHERE customer_phone = ? AND amount = ? AND operation_type = ? AND account_id = ? 
                    ORDER BY id DESC LIMIT 1
                """, (customer_phone, amount, op_type, account_id))
                last_op = cursor.fetchone()
                if last_op:
                    # check time diff
                    try:
                        last_dt = datetime.strptime(f"{last_op['date']} {last_op['time']}", '%Y-%m-%d %H:%M:%S')
                        now_dt = datetime.strptime(f"{now_date} {now_time}", '%Y-%m-%d %H:%M:%S')
                        diff = (now_dt - last_dt).total_seconds()
                        if diff < 15:
                            self.write_json_response(400, {"error": "عملية مكررة! يرجى الانتظار 15 ثانية قبل إعادة إرسال نفس العملية"})
                            return
                    except Exception:
                        pass
                
                # Generate unique operation number
                cursor.execute("SELECT MAX(id) FROM operations")
                max_id = cursor.fetchone()[0] or 0
                operation_number = f"OP-{now_date.replace('-', '')}-{max_id + 1:04d}"
                
                # Update Account Balance
                cursor.execute("UPDATE accounts SET current_balance = ? WHERE id = ?", (new_balance, account_id))
                
                # Insert Operation
                cursor.execute("""
                    INSERT INTO operations (operation_number, date, time, employee_name, customer_name, customer_phone,
                                           account_id, account_name, operation_type, amount, commission, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (operation_number, now_date, now_time, employee_name, customer_name, customer_phone,
                      account_id, account['name'], op_type, amount, commission, notes))
                
                conn.commit()
                self.write_json_response(201, {"success": True, "operation_number": operation_number})
                
            elif path == '/api/operations/transfer':
                # Special internal wallet-to-wallet transfer
                from_account_id = data.get('from_account_id')
                to_account_id = data.get('to_account_id')
                amount = float(data.get('amount', 0.0))
                employee_name = data.get('employee_name')
                notes = data.get('notes', 'تحويل رصيد داخلي بين المحافظ')
                
                cursor.execute("SELECT * FROM accounts WHERE id = ?", (from_account_id,))
                from_account = cursor.fetchone()
                cursor.execute("SELECT * FROM accounts WHERE id = ?", (to_account_id,))
                to_account = cursor.fetchone()
                
                if not from_account or not to_account:
                    self.write_json_response(404, {"error": "أحد الحسابات غير موجود"})
                    return
                
                if from_account['current_balance'] < amount:
                    self.write_json_response(400, {"error": f"الرصيد غير كافٍ في المحفظة المصدر. الرصيد الحالي: {from_account['current_balance']} جنيه"})
                    return
                
                now_date = datetime.now().strftime('%Y-%m-%d')
                now_time = datetime.now().strftime('%H:%M:%S')
                
                # 1. Update balances
                from_new = from_account['current_balance'] - amount
                to_new = to_account['current_balance'] + amount
                
                cursor.execute("UPDATE accounts SET current_balance = ? WHERE id = ?", (from_new, from_account_id))
                cursor.execute("UPDATE accounts SET current_balance = ? WHERE id = ?", (to_new, to_account_id))
                
                # 2. Record operation for source account (as a transfer/out)
                cursor.execute("SELECT MAX(id) FROM operations")
                max_id = cursor.fetchone()[0] or 0
                op_num_1 = f"OP-{now_date.replace('-', '')}-{max_id + 1:04d}"
                cursor.execute("""
                    INSERT INTO operations (operation_number, date, time, employee_name, customer_name, customer_phone,
                                           account_id, account_name, operation_type, amount, commission, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (op_num_1, now_date, now_time, employee_name, "تحويل داخلي", to_account['phone_number'],
                      from_account_id, from_account['name'], 'transfer_out', amount, 0.0, f"تحويل إلى {to_account['name']} - {notes}"))
                
                # 3. Record operation for destination account (as a transfer/in)
                op_num_2 = f"OP-{now_date.replace('-', '')}-{max_id + 2:04d}"
                cursor.execute("""
                    INSERT INTO operations (operation_number, date, time, employee_name, customer_name, customer_phone,
                                           account_id, account_name, operation_type, amount, commission, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (op_num_2, now_date, now_time, employee_name, "تحويل داخلي", from_account['phone_number'],
                      to_account_id, to_account['name'], 'transfer_in', amount, 0.0, f"استلام من {from_account['name']} - {notes}"))
                
                conn.commit()
                self.write_json_response(200, {"success": True, "message": "تم التحويل الداخلي بنجاح"})
                
            elif path == '/api/employees':
                username = data.get('username')
                name = data.get('name')
                password = data.get('password')
                role = data.get('role', 'employee')
                permissions = json.dumps(data.get('permissions', {}))
                status = data.get('status', 'active')
                
                # Validate duplicate username
                cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
                if cursor.fetchone():
                    self.write_json_response(400, {"error": "اسم المستخدم موجود بالفعل"})
                    return
                    
                cursor.execute("""
                    INSERT INTO users (username, name, password, role, permissions, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (username, name, password, role, permissions, status))
                conn.commit()
                self.write_json_response(201, {"success": True, "id": cursor.lastrowid})
                
            elif path == '/api/backup/run':
                # Manual Backup
                filename = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
                dest_path = os.path.join(BACKUP_DIR, filename)
                shutil.copyfile(DB_FILE, dest_path)
                self.write_json_response(200, {"success": True, "filename": filename})
                
            elif path == '/api/backup/restore':
                # Restore Backup
                filename = data.get('filename')
                src_path = os.path.join(BACKUP_DIR, filename)
                if not os.path.exists(src_path):
                    self.write_json_response(404, {"error": "ملف النسخة الاحتياطية غير موجود"})
                    return
                # Close SQLite connection safely before overwrite
                conn.close()
                shutil.copyfile(src_path, DB_FILE)
                # Reopen connection
                self.write_json_response(200, {"success": True, "message": "تم استعادة النسخة الاحتياطية بنجاح. يرجى إعادة تشغيل التطبيق"})
                return
                
            elif path == '/api/settings':
                # Update multiple settings
                for key, val in data.items():
                    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(val)))
                conn.commit()
                self.write_json_response(200, {"success": True})
                
            elif path == '/api/closing':
                # Save daily closing report
                date_str = data.get('date', datetime.now().strftime('%Y-%m-%d'))
                opening_balance = float(data.get('opening_balance', 0.0))
                closing_balance = float(data.get('closing_balance', 0.0))
                operations_count = int(data.get('operations_count', 0))
                commission = float(data.get('commission', 0.0))
                profit = float(data.get('profit', 0.0))
                cash_difference = float(data.get('cash_difference', 0.0))
                notes = data.get('notes', '')
                
                # Check and save
                cursor.execute("""
                    INSERT OR REPLACE INTO daily_closings (date, opening_balance, closing_balance, operations_count, commission, profit, cash_difference, status, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'closed', ?)
                """, (date_str, opening_balance, closing_balance, operations_count, commission, profit, cash_difference, notes))
                
                # Reset daily balance of all accounts to their current balance for the new day
                cursor.execute("UPDATE accounts SET daily_balance = current_balance")
                
                conn.commit()
                self.write_json_response(200, {"success": True, "message": "تم إغلاق اليوم المالي بنجاح وتحديث الرصيد الافتتاحي"})
                
            else:
                self.write_json_response(404, {"error": "Not Found"})
        except Exception as e:
            self.write_json_response(500, {"error": str(e)})
        finally:
            conn.close()

    # =========================================================================
    # API PUT REQUESTS
    # =========================================================================
    def handle_api_put(self, path, data):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            if path.startswith('/api/accounts'):
                # Edit Account
                acc_id = data.get('id')
                name = data.get('name')
                phone_number = data.get('phone_number')
                wallet_number = data.get('wallet_number')
                current_balance = float(data.get('current_balance', 0.0))
                daily_balance = float(data.get('daily_balance', current_balance))
                status = data.get('status', 'active')
                notes = data.get('notes', '')
                
                cursor.execute("""
                    UPDATE accounts
                    SET name = ?, phone_number = ?, wallet_number = ?, current_balance = ?, daily_balance = ?, status = ?, notes = ?
                    WHERE id = ?
                """, (name, phone_number, wallet_number, current_balance, daily_balance, status, notes, acc_id))
                conn.commit()
                self.write_json_response(200, {"success": True})
                
            elif path.startswith('/api/employees'):
                # Edit Employee
                emp_id = data.get('id')
                username = data.get('username')
                name = data.get('name')
                role = data.get('role')
                permissions = json.dumps(data.get('permissions', {}))
                status = data.get('status')
                
                # Check for password update
                password = data.get('password')
                if password:
                    cursor.execute("""
                        UPDATE users
                        SET username = ?, name = ?, password = ?, role = ?, permissions = ?, status = ?
                        WHERE id = ?
                    """, (username, name, password, role, permissions, status, emp_id))
                else:
                    cursor.execute("""
                        UPDATE users
                        SET username = ?, name = ?, role = ?, permissions = ?, status = ?
                        WHERE id = ?
                    """, (username, name, role, permissions, status, emp_id))
                conn.commit()
                self.write_json_response(200, {"success": True})
                
            elif path.startswith('/api/operations'):
                # Edit Operation (Only notes and commission should usually be editable for integrity, but we'll support full edit with balance adjustment)
                op_id = data.get('id')
                commission = float(data.get('commission', 0.0))
                notes = data.get('notes', '')
                customer_name = data.get('customer_name', '')
                customer_phone = data.get('customer_phone', '')
                
                cursor.execute("""
                    UPDATE operations
                    SET commission = ?, notes = ?, customer_name = ?, customer_phone = ?
                    WHERE id = ?
                """, (commission, notes, customer_name, customer_phone, op_id))
                conn.commit()
                self.write_json_response(200, {"success": True})
            else:
                self.write_json_response(404, {"error": "Not Found"})
        except Exception as e:
            self.write_json_response(500, {"error": str(e)})
        finally:
            conn.close()

    # =========================================================================
    # API DELETE REQUESTS
    # =========================================================================
    def handle_api_delete(self, path, query):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            if path == '/api/accounts':
                acc_id = query.get('id', [None])[0]
                if acc_id:
                    # Safe Delete check (don't delete if has operations, disable it instead, or delete if forced)
                    cursor.execute("SELECT COUNT(*) FROM operations WHERE account_id = ?", (acc_id,))
                    count = cursor.fetchone()[0]
                    if count > 0:
                        self.write_json_response(400, {"error": "لا يمكن حذف هذا الحساب لأنه يحتوي على عمليات مسجلة. يمكنك تعطيله بدلاً من ذلك."})
                        return
                        
                    cursor.execute("DELETE FROM accounts WHERE id = ?", (acc_id,))
                    conn.commit()
                    self.write_json_response(200, {"success": True})
                else:
                    self.write_json_response(400, {"error": "Missing id parameter"})
                    
            elif path == '/api/employees':
                emp_id = query.get('id', [None])[0]
                if emp_id:
                    # Prevent deleting admin account
                    cursor.execute("SELECT username FROM users WHERE id = ?", (emp_id,))
                    user = cursor.fetchone()
                    if user and user['username'] == 'admin':
                        self.write_json_response(400, {"error": "لا يمكن حذف حساب المدير الرئيسي العام (admin)"})
                        return
                        
                    cursor.execute("DELETE FROM users WHERE id = ?", (emp_id,))
                    conn.commit()
                    self.write_json_response(200, {"success": True})
                else:
                    self.write_json_response(400, {"error": "Missing id parameter"})
                    
            elif path == '/api/operations':
                op_id = query.get('id', [None])[0]
                if op_id:
                    # Revert balance on delete for integrity
                    cursor.execute("SELECT * FROM operations WHERE id = ?", (op_id,))
                    op = cursor.fetchone()
                    if op:
                        account_id = op['account_id']
                        op_type = op['operation_type']
                        amount = op['amount']
                        
                        cursor.execute("SELECT current_balance FROM accounts WHERE id = ?", (account_id,))
                        acc = cursor.fetchone()
                        if acc:
                            new_balance = acc['current_balance']
                            if op_type == 'withdrawal':
                                # withdrawal added to balance, so delete subtracts
                                new_balance -= amount
                            elif op_type in ['deposit', 'transfer', 'bill_payment']:
                                # deposit subtracted balance, so delete adds it back
                                new_balance += amount
                            
                            cursor.execute("UPDATE accounts SET current_balance = ? WHERE id = ?", (new_balance, account_id))
                        
                        cursor.execute("DELETE FROM operations WHERE id = ?", (op_id,))
                        conn.commit()
                        self.write_json_response(200, {"success": True})
                    else:
                        self.write_json_response(404, {"error": "العملية غير موجودة"})
                else:
                    self.write_json_response(400, {"error": "Missing id parameter"})
            else:
                self.write_json_response(404, {"error": "Not Found"})
        except Exception as e:
            self.write_json_response(500, {"error": str(e)})
        finally:
            conn.close()

if __name__ == '__main__':
    print("Initializing Database...")
    init_db()
    
    # Check for backups list in backups folder
    print(f"Backups folder: {os.path.abspath(BACKUP_DIR)}")
    
    # Run simple server
    server_address = ('', PORT)
    try:
        # Use ThreadingHTTPServer to avoid blocking requests
        # (available in Python 3.7+)
        if hasattr(http.server, 'ThreadingHTTPServer'):
            httpd = http.server.ThreadingHTTPServer(server_address, CustomAPIHandler)
        else:
            httpd = socketserver.TCPServer(server_address, CustomAPIHandler)
            
        print(f"سنترال شرف الدين backend is running on http://localhost:{PORT}")
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        sys.exit(0)
    except Exception as e:
        print(f"Error starting server: {e}")
        sys.exit(1)
