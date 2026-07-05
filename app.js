/* =========================================================================
    سنترال شرف الدين - نظام إدارة فودافون كاش
   ملف التحكم والمنطق البرمجي (Javascript)
   ========================================================================= */

// التهيئة والمتغيرات العامة
const BASE_URL = ''; // بما أنه يتم استضافته محلياً على نفس المنفذ
let currentUser = null;
let activePage = 'dashboard';
let theme = 'light';
let activeReportTab = 'daily';
let dailyChart = null;
let monthlyChart = null;

// التحميل الأولي للتطبيق
document.addEventListener('DOMContentLoaded', () => {
    // 1. تشغيل ساعة الهيدر
    startHeaderClock();
    
    // 2. التحقق من جلسة تسجيل الدخول المخزنة
    checkSavedSession();
    
    // 3. مستمعي أحداث النماذج
    setupFormListeners();
    
    // 4. إغلاق شاشة التحميل البدئية بعد ثانية
    setTimeout(() => {
        const loader = document.getElementById('app-loader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 1000);
    
    // تهيئة الأيقونات
    if (window.lucide) {
        lucide.createIcons();
    }
});

// =========================================================================
// إدارة المظهر وجلسات تسجيل الدخول (Theme & Auth)
// =========================================================================

function checkSavedSession() {
    const savedUser = localStorage.getItem('sharaf_user');
    const savedRemember = localStorage.getItem('sharaf_remember');
    const savedTheme = localStorage.getItem('sharaf_theme') || 'light';
    
    // تعيين الثيم المخزن
    setTheme(savedTheme);
    
    if (savedUser && (savedRemember === 'true')) {
        currentUser = JSON.parse(savedUser);
        loginSuccess(currentUser);
    } else {
        // إظهار واجهة تسجيل الدخول وإخفاء التطبيق
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
}

function setTheme(newTheme) {
    theme = newTheme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sharaf_theme', theme);
    
    const sunIcon = document.getElementById('theme-icon-light');
    const moonIcon = document.getElementById('theme-icon-dark');
    
    if (theme === 'dark') {
        if (sunIcon) sunIcon.style.display = 'none';
        if (moonIcon) moonIcon.style.display = 'block';
    } else {
        if (sunIcon) sunIcon.style.display = 'block';
        if (moonIcon) moonIcon.style.display = 'none';
    }
}

function toggleTheme() {
    setTheme(theme === 'light' ? 'dark' : 'light');
    showToast('تم تغيير مظهر النظام بنجاح', 'info');
}

function startHeaderClock() {
    const timeEl = document.getElementById('header-time');
    const dateEl = document.getElementById('header-date');
    
    function updateClock() {
        const now = new Date();
        
        // تنسيق الوقت العربي
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'م' : 'ص';
        hours = hours % 12;
        hours = hours ? hours : 12; // الساعة 0 تصبح 12
        
        if (timeEl) {
            timeEl.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
        }
        
        // تنسيق التاريخ العربي
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('ar-EG', options);
        }
    }
    
    updateClock();
    setInterval(updateClock, 1000);
}

function togglePasswordVisibility(fieldId) {
    const input = document.getElementById(fieldId);
    const eye = document.getElementById(fieldId + '-eye');
    if (input) {
        if (input.type === 'password') {
            input.type = 'text';
            eye.setAttribute('data-lucide', 'eye-off');
        } else {
            input.type = 'password';
            eye.setAttribute('data-lucide', 'eye');
        }
        lucide.createIcons();
    }
}

function setupFormListeners() {
    // نموذج تسجيل الدخول
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            const remember = document.getElementById('login-remember').checked;
            
            // إظهار زر جاري التحميل
            const submitBtn = document.getElementById('login-submit-btn');
            submitBtn.disabled = true;
            submitBtn.querySelector('span').textContent = 'جاري التحقق...';
            
            fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(data => { throw new Error(data.error || 'فشل تسجيل الدخول') });
                }
                return res.json();
            })
            .then(data => {
                currentUser = data.user;
                localStorage.setItem('sharaf_user', JSON.stringify(currentUser));
                localStorage.setItem('sharaf_remember', remember);
                
                showToast(`أهلاً بك يا ${currentUser.name}، تم الدخول بنجاح!`, 'success');
                loginSuccess(currentUser);
            })
            .catch(err => {
                showToast(err.message, 'error');
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.querySelector('span').textContent = 'تسجيل الدخول';
            });
        });
    }
    
    // نموذج عملية جديدة
    const newOpForm = document.getElementById('new-op-form');
    if (newOpForm) {
        newOpForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveOperation();
        });
    }

    // نموذج تحويل داخلي
    const internalTransferForm = document.getElementById('internal-transfer-form');
    if (internalTransferForm) {
        internalTransferForm.addEventListener('submit', (e) => {
            e.preventDefault();
            runInternalTransfer();
        });
    }
    
    // نموذج إضافة/تعديل حساب
    const accountModalForm = document.getElementById('account-modal-form');
    if (accountModalForm) {
        accountModalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveAccount();
        });
    }

    // نموذج تصفية اليوم المالي
    const closingForm = document.getElementById('closing-form');
    if (closingForm) {
        closingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitDailyClosing();
        });
    }

    // نموذج الموظفين
    const employeeForm = document.getElementById('employee-form');
    if (employeeForm) {
        employeeForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveEmployee();
        });
    }

    // نموذج الإعدادات العامة
    const settingsGeneralForm = document.getElementById('settings-general-form');
    if (settingsGeneralForm) {
        settingsGeneralForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveSettingsGeneral();
        });
    }

    // نموذج تغيير كلمة مرور المدير
    const settingsPasswordForm = document.getElementById('settings-password-form');
    if (settingsPasswordForm) {
        settingsPasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveSettingsPassword();
        });
    }
}

function loginSuccess(user) {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    
    // تحديث الهيدر والجانب بالاسم والرتبة
    document.getElementById('nav-user-name').textContent = user.name;
    document.getElementById('nav-user-role').textContent = user.role === 'admin' ? 'مدير عام النظام' : 'موظف كاشير';
    
    // تطبيق الصلاحيات والتحكم في إظهار القائمة
    applyUserPermissions(user);
    
    // الانتقال للوحة التحكم افتراضياً وتحميل بياناتها
    navigateTo('dashboard');
}

function applyUserPermissions(user) {
    const adminOnlyItems = document.querySelectorAll('[data-page="employees"], [data-page="backup"], [data-page="settings"]');
    if (user.role !== 'admin') {
        adminOnlyItems.forEach(item => item.style.display = 'none');
    } else {
        adminOnlyItems.forEach(item => item.style.display = 'flex');
    }
}

function logout() {
    if (confirm('هل أنت متأكد من رغبتك في تسجيل الخروج من النظام؟')) {
        currentUser = null;
        localStorage.removeItem('sharaf_user');
        localStorage.removeItem('sharaf_remember');
        
        document.getElementById('login-container').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        showToast('تم تسجيل الخروج بنجاح', 'info');
    }
}

// =========================================================================
// شريط إشعارات التوست (Toast System)
// =========================================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle';
    else if (type === 'error') iconName = 'alert-octagon';
    else if (type === 'warning') iconName = 'alert-triangle';
    
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    // إزالة التوست بعد 4 ثوانٍ تلقائياً
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// =========================================================================
// التوجيه والتنقل بين الصفحات (Navigation)
// =========================================================================

function navigateTo(pageId) {
    activePage = pageId;
    
    // 1. تحديث قائمة الروابط النشطة
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('data-page') === pageId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // 2. تفعيل صفحة المحتوى وإخفاء الباقي
    document.querySelectorAll('.page-section').forEach(section => {
        if (section.id === `page-${pageId}`) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });
    
    // 3. إغلاق القائمة الجانبية في شاشات الجوال
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('active');
    
    // 4. تحميل بيانات الصفحة بشكل مخصص
    loadPageData(pageId);
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

function loadPageData(pageId) {
    if (pageId === 'dashboard') {
        loadDashboardData();
    } else if (pageId === 'new-operation') {
        initNewOperationPage();
    } else if (pageId === 'history') {
        initHistoryPage();
    } else if (pageId === 'accounts') {
        loadAccountsData();
    } else if (pageId === 'reports') {
        generateReport();
    } else if (pageId === 'employees') {
        loadEmployeesPage();
    } else if (pageId === 'backup') {
        loadBackupsList();
    } else if (pageId === 'settings') {
        loadSettingsPage();
    }
}

// =========================================================================
// منطق لوحة التحكم والرسوم البيانية (Dashboard & Charts)
// =========================================================================

function loadDashboardData() {
    fetch(`${BASE_URL}/api/dashboard`)
    .then(res => res.json())
    .then(data => {
        // تحديث الأرقام والبطاقات
        document.getElementById('stat-today-ops').textContent = data.today_operations;
        document.getElementById('stat-today-comm').textContent = formatCurrency(data.today_commission);
        document.getElementById('stat-today-profit').textContent = formatCurrency(data.today_profit);
        document.getElementById('stat-current-cash').textContent = formatCurrency(data.current_cash);
        document.getElementById('stat-accounts-count').textContent = data.accounts_count;
        document.getElementById('stat-top-employee').textContent = data.top_employee;
        
        // تحديث جدول آخر عمليات اليوم
        renderRecentOpsTable(data.recent_operations);
        
        // تهيئة/تحديث الرسوم البيانية
        renderDashboardCharts(data.charts);
        
        // تحميل وضع اليوم المالي
        checkDailyClosingStatus();
    })
    .catch(err => {
        showToast('فشل تحميل إحصائيات لوحة التحكم: ' + err.message, 'error');
    });
}

function renderRecentOpsTable(ops) {
    const tbody = document.getElementById('dashboard-recent-ops-tbody');
    if (!tbody) return;
    
    if (ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">لا توجد عمليات مسجلة لليوم المالي الحالي.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    ops.forEach(op => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="bold">${op.operation_number}</td>
            <td>${op.time}</td>
            <td>${op.employee_name}</td>
            <td>${op.customer_name || 'زبون عام'}</td>
            <td class="bold">${op.customer_phone || 'لا يوجد'}</td>
            <td>${op.account_name}</td>
            <td><span class="status-badge ${getOpTypeClass(op.operation_type)}">${getArabicOpType(op.operation_type)}</span></td>
            <td class="bold">${formatCurrency(op.amount)}</td>
            <td class="bold text-success">${formatCurrency(op.commission)}</td>
            <td>
                <div class="btn-actions">
                    <button class="btn btn-outline btn-xs" onclick="printReceipt('${op.operation_number}')" title="طباعة وصل"><i data-lucide="printer"></i></button>
                    <button class="btn btn-outline btn-xs" onclick="duplicateOp(${JSON.stringify(op).replace(/"/g, '&quot;')})" title="تكرار العملية"><i data-lucide="copy"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function renderDashboardCharts(chartData) {
    // 1. رسم بياني للعمليات اليومية (آخر 7 أيام)
    const ctxDaily = document.getElementById('dailyOpsChart');
    if (ctxDaily) {
        if (dailyChart) dailyChart.destroy();
        dailyChart = new Chart(ctxDaily, {
            type: 'line',
            data: {
                labels: chartData.daily_ops.labels,
                datasets: [
                    {
                        label: 'عدد العمليات',
                        data: chartData.daily_ops.counts,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'العمولات والأرباح (ج.م)',
                        data: chartData.daily_ops.profits,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { font: { family: 'Cairo' } } }
                },
                scales: {
                    x: { ticks: { font: { family: 'Cairo' } } },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        ticks: { font: { family: 'Cairo' } }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { drawOnChartArea: false },
                        ticks: { font: { family: 'Cairo' } }
                    }
                }
            }
        });
    }
    
    // 2. رسم بياني للأرباح الشهرية (آخر 6 أشهر)
    const ctxMonthly = document.getElementById('monthlyProfitChart');
    if (ctxMonthly) {
        if (monthlyChart) monthlyChart.destroy();
        monthlyChart = new Chart(ctxMonthly, {
            type: 'bar',
            data: {
                labels: chartData.monthly_profit.labels,
                datasets: [{
                    label: 'الأرباح المحققة (ج.م)',
                    data: chartData.monthly_profit.profits,
                    backgroundColor: '#047857',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { font: { family: 'Cairo' } } }
                },
                scales: {
                    x: { ticks: { font: { family: 'Cairo' } } },
                    y: { ticks: { font: { family: 'Cairo' } }, position: 'right' }
                }
            }
        });
    }
}

// =========================================================================
// صفحة وإجراءات عملية جديدة (New Operation Logic)
// =========================================================================

function initNewOperationPage() {
    // 1. تعيين اسم الموظف الحالي والتاريخ التلقائي
    if (currentUser) {
        document.getElementById('op-employee').value = currentUser.name;
    }
    
    const now = new Date();
    document.getElementById('op-date-time').value = now.toLocaleString('ar-EG');
    
    // 2. تحميل المحافظ المتاحة
    fetchActiveAccountsDropdown();
}

function fetchActiveAccountsDropdown() {
    fetch(`${BASE_URL}/api/accounts`)
    .then(res => res.json())
    .then(data => {
        // مصفاة للمحافظ النشطة فقط
        const activeAccounts = data.filter(acc => acc.status === 'active');
        
        const opSelect = document.getElementById('op-account-select');
        const transferFrom = document.getElementById('transfer-from-select');
        const transferTo = document.getElementById('transfer-to-select');
        
        if (opSelect) {
            opSelect.innerHTML = '';
            activeAccounts.forEach(acc => {
                opSelect.innerHTML += `<option value="${acc.id}" data-balance="${acc.current_balance}">${acc.name} (${acc.phone_number}) [رصيد: ${acc.current_balance}ج.م]</option>`;
            });
        }
        
        if (transferFrom) {
            transferFrom.innerHTML = '';
            activeAccounts.forEach(acc => {
                transferFrom.innerHTML += `<option value="${acc.id}" data-balance="${acc.current_balance}">${acc.name} [رصيد: ${acc.current_balance}ج.م]</option>`;
            });
        }
        
        if (transferTo) {
            transferTo.innerHTML = '';
            activeAccounts.forEach(acc => {
                transferTo.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.phone_number})</option>`;
            });
        }
        
        updateSelectedAccountBalance();
        updateTransferFromBalance();
    })
    .catch(err => showToast('فشل تعبئة قوائم المحافظ: ' + err.message, 'error'));
}

function updateSelectedAccountBalance() {
    const select = document.getElementById('op-account-select');
    const indicator = document.getElementById('selected-acc-bal-indicator');
    if (!select || !indicator) return;
    
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.value) {
        const bal = selectedOption.getAttribute('data-balance');
        indicator.textContent = `الرصيد المتوفر في المحفظة: ${formatCurrency(parseFloat(bal))} جنيه`;
        indicator.style.color = parseFloat(bal) > 0 ? 'var(--primary-green)' : 'var(--danger-red)';
    } else {
        indicator.textContent = 'الرصيد المتوفر: 0.00 ج.م';
        indicator.style.color = 'var(--text-muted)';
    }
}

function updateTransferFromBalance() {
    const select = document.getElementById('transfer-from-select');
    const indicator = document.getElementById('transfer-from-bal-indicator');
    if (!select || !indicator) return;
    
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption && selectedOption.value) {
        const bal = selectedOption.getAttribute('data-balance');
        indicator.textContent = `الرصيد: ${formatCurrency(parseFloat(bal))} ج.م`;
    } else {
        indicator.textContent = 'الرصيد: 0.00 ج.م';
    }
}

function handleOpTypeChange() {
    calculateSuggestedCommission();
}

function calculateSuggestedCommission() {
    const amountVal = parseFloat(document.getElementById('op-amount').value) || 0;
    const typeSelect = document.getElementById('op-type-select').value;
    const commInput = document.getElementById('op-commission');
    
    if (!commInput) return;
    
    // عمولات السنترال المقترحة لفودافون كاش
    // السحب: فودافون تخصم 1% من رصيد العميل، السنترال عادة لا يفرض عمولة مضافة إلا كاش إضافي أو حسب الاتفاق
    // الإيداع: العميل يعطيك كاش وتدفع له رصيد فودافون كاش، ويكون هناك عمولة متفق عليها في السنترال
    let suggested = 0.0;
    
    if (typeSelect === 'deposit' || typeSelect === 'transfer' || typeSelect === 'bill_payment') {
        if (amountVal <= 100) suggested = 5.0;
        else if (amountVal <= 500) suggested = 10.0;
        else if (amountVal <= 1000) suggested = 15.0;
        else suggested = Math.ceil(amountVal * 0.015); // 1.5% للمبالغ الأكبر
    } else if (typeSelect === 'withdrawal') {
        // في السحب العميل تخصم منه شبكة فودافون 1% ويسحبها السنترال كاش.
        // السنترال قد يخصم عمولة سحب بسيطة (مثلاً 5 جنيه أو 0.5% للسيولة)
        suggested = Math.max(5.0, Math.ceil(amountVal * 0.005));
    }
    
    commInput.value = suggested.toFixed(2);
}

function saveOperation() {
    const employee_name = currentUser ? currentUser.name : 'موظف';
    const customer_name = document.getElementById('op-customer-name').value;
    const customer_phone = document.getElementById('op-customer-phone').value;
    const account_id = document.getElementById('op-account-select').value;
    const operation_type = document.getElementById('op-type-select').value;
    const amount = parseFloat(document.getElementById('op-amount').value);
    const commission = parseFloat(document.getElementById('op-commission').value) || 0.0;
    const notes = document.getElementById('op-notes').value;
    
    if (!account_id) {
        showToast('يرجى اختيار محفظة فودافون كاش أولاً', 'warning');
        return;
    }
    
    // إرسال الطلب للخادم
    const saveBtn = document.getElementById('save-op-btn');
    saveBtn.disabled = true;
    saveBtn.querySelector('span').textContent = 'جاري الحفظ...';
    
    fetch(`${BASE_URL}/api/operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            employee_name,
            customer_name,
            customer_phone,
            account_id,
            operation_type,
            amount,
            commission,
            notes
        })
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(data => { throw new Error(data.error || 'فشل حفظ العملية') });
        }
        return res.json();
    })
    .then(data => {
        showToast(`تم تسجيل العملية بنجاح برقم: ${data.operation_number}`, 'success');
        resetNewOpForm();
        
        // الانتقال للوحة التحكم أو السجل
        navigateTo('dashboard');
    })
    .catch(err => {
        showToast(err.message, 'error');
    })
    .finally(() => {
        saveBtn.disabled = false;
        saveBtn.querySelector('span').textContent = 'حفظ وتسجيل العملية';
    });
}

function resetNewOpForm() {
    const form = document.getElementById('new-op-form');
    if (form) form.reset();
    initNewOperationPage();
}

function runInternalTransfer() {
    const from_account_id = document.getElementById('transfer-from-select').value;
    const to_account_id = document.getElementById('transfer-to-select').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    const notes = document.getElementById('transfer-notes').value;
    const employee_name = currentUser ? currentUser.name : 'موظف';
    
    if (!from_account_id || !to_account_id) {
        showToast('يرجى اختيار المحفظة المرسلة والمستلمة', 'warning');
        return;
    }
    
    if (from_account_id === to_account_id) {
        showToast('لا يمكن التحويل لنفس المحفظة المصدر', 'warning');
        return;
    }
    
    if (confirm('هل أنت متأكد من تنفيذ هذا التحويل الكاش الداخلي بين المحافظ؟')) {
        fetch(`${BASE_URL}/api/operations/transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from_account_id,
                to_account_id,
                amount,
                employee_name,
                notes
            })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => { throw new Error(data.error || 'فشل التحويل') });
            }
            return res.json();
        })
        .then(data => {
            showToast(data.message, 'success');
            document.getElementById('internal-transfer-form').reset();
            fetchActiveAccountsDropdown();
        })
        .catch(err => showToast(err.message, 'error'));
    }
}

// =========================================================================
// سجل العمليات والمصفاة (Operations History Page)
// =========================================================================

function initHistoryPage() {
    // 1. ملء الفلاتر بالمحافظ والموظفين
    fetchFiltersData();
    
    // 2. تحميل وعرض جدول العمليات بالكامل
    loadHistoryTable();
}

function fetchFiltersData() {
    // تحميل الموظفين
    fetch(`${BASE_URL}/api/employees`)
    .then(res => res.json())
    .then(users => {
        const empSelect = document.getElementById('filter-employee');
        if (empSelect) {
            empSelect.innerHTML = '<option value="">جميع الموظفين</option>';
            users.forEach(u => {
                empSelect.innerHTML += `<option value="${u.name}">${u.name}</option>`;
            });
        }
    });
    
    // تحميل المحافظ
    fetch(`${BASE_URL}/api/accounts`)
    .then(res => res.json())
    .then(accounts => {
        const accSelect = document.getElementById('filter-account');
        if (accSelect) {
            accSelect.innerHTML = '<option value="">جميع المحافظ</option>';
            accounts.forEach(a => {
                accSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`;
            });
        }
    });
}

function loadHistoryTable() {
    const search = document.getElementById('filter-search').value;
    const date = document.getElementById('filter-date').value;
    const employee = document.getElementById('filter-employee').value;
    const account = document.getElementById('filter-account').value;
    const type = document.getElementById('filter-type').value;
    
    // بناء الرابط البرمجي مع عوامل التصفية
    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (date) params.append('date', date);
    if (employee) params.append('employee', employee);
    if (account) params.append('account', account);
    if (type) params.append('type', type);
    
    fetch(`${BASE_URL}/api/operations?${params.toString()}`)
    .then(res => res.json())
    .then(data => {
        renderHistoryTable(data);
    })
    .catch(err => showToast('فشل تحميل السجل: ' + err.message, 'error'));
}

function applyHistoryFilters() {
    loadHistoryTable();
    showToast('تم تطبيق مرشحات التصفية', 'success');
}

function clearHistoryFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-date').value = '';
    document.getElementById('filter-employee').value = '';
    document.getElementById('filter-account').value = '';
    document.getElementById('filter-type').value = '';
    loadHistoryTable();
    showToast('تمت إعادة تعيين حقول التصفية', 'info');
}

function renderHistoryTable(ops) {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;
    
    if (ops.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">لا توجد عمليات تطابق البحث والتصفية المحددة.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    ops.forEach(op => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="bold">${op.operation_number}</td>
            <td>${op.date}</td>
            <td>${op.time}</td>
            <td>${op.employee_name}</td>
            <td>${op.customer_name || 'زبون عام'}</td>
            <td class="bold">${op.customer_phone || 'لا يوجد'}</td>
            <td>${op.account_name}</td>
            <td><span class="status-badge ${getOpTypeClass(op.operation_type)}">${getArabicOpType(op.operation_type)}</span></td>
            <td class="bold">${formatCurrency(op.amount)}</td>
            <td class="bold text-success">${formatCurrency(op.commission)}</td>
            <td>
                <div class="btn-actions">
                    <button class="btn btn-outline btn-xs" onclick="printReceipt('${op.operation_number}')" title="طباعة وصل الدفع"><i data-lucide="printer"></i></button>
                    <button class="btn btn-outline btn-xs" onclick="duplicateOp(${JSON.stringify(op).replace(/"/g, '&quot;')})" title="تكرار / إعادة عملية"><i data-lucide="copy"></i></button>
                    ${currentUser && currentUser.role === 'admin' ? `
                        <button class="btn btn-danger btn-xs" onclick="deleteOperation(${op.id})" title="حذف العملية"><i data-lucide="trash-2"></i></button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    lucide.createIcons();
}

function duplicateOp(op) {
    // الانتقال لصفحة عملية جديدة وتعبئة الحقول
    navigateTo('new-operation');
    setTimeout(() => {
        document.getElementById('op-customer-name').value = op.customer_name || '';
        document.getElementById('op-customer-phone').value = op.customer_phone || '';
        document.getElementById('op-type-select').value = op.operation_type;
        document.getElementById('op-amount').value = op.amount;
        document.getElementById('op-commission').value = op.commission;
        document.getElementById('op-notes').value = `مكرر من عملية ${op.operation_number} - ${op.notes || ''}`;
        
        // محاولة اختيار المحفظة الصحيحة
        const select = document.getElementById('op-account-select');
        if (select) {
            select.value = op.account_id;
            updateSelectedAccountBalance();
        }
        showToast('تم نسخ تفاصيل العملية السابقة للتعديل والتسجيل المباشر', 'info');
    }, 300);
}

function deleteOperation(opId) {
    if (confirm('تنبيه هام جداً: حذف هذه العملية سيؤدي لإعادة رصيد المحفظة السابق كما كان قبل إجراء هذه العملية. هل تريد المتابعة والحذف فعلاً؟')) {
        fetch(`${BASE_URL}/api/operations?id=${opId}`, {
            method: 'DELETE'
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => { throw new Error(data.error || 'فشل حذف العملية') });
            }
            return res.json();
        })
        .then(data => {
            showToast('تم حذف العملية بنجاح وتصحيح رصيد المحفظة تلقائياً', 'success');
            loadHistoryTable();
        })
        .catch(err => showToast(err.message, 'error'));
    }
}

// =========================================================================
// إدارة وإعدادات محافظ فودافون كاش (Vodafone Accounts Page)
// =========================================================================

function loadAccountsData() {
    fetch(`${BASE_URL}/api/accounts`)
    .then(res => res.json())
    .then(accounts => {
        renderAccountsGrid(accounts);
    })
    .catch(err => showToast('فشل تحميل المحافظ: ' + err.message, 'error'));
}

function renderAccountsGrid(accounts) {
    const container = document.getElementById('accounts-cards-container');
    if (!container) return;
    
    container.innerHTML = '';
    accounts.forEach(acc => {
        const div = document.createElement('div');
        div.className = `account-card ${acc.status === 'inactive' ? 'opacity-60' : ''}`;
        
        div.innerHTML = `
            <div>
                <div class="account-card-header">
                    <div class="account-name-phone">
                        <h4>${acc.name}</h4>
                        <span>رقم الحساب: ${acc.phone_number}</span>
                    </div>
                    <span class="status-badge ${acc.status === 'active' ? 'active' : 'inactive'}">
                        ${acc.status === 'active' ? 'نشط' : 'معطل'}
                    </span>
                </div>
                
                <div class="account-balances-box">
                    <div class="bal-sub total-bal">
                        <span>الرصيد الفعلي الحالي</span>
                        <span>${formatCurrency(acc.current_balance)} ج.م</span>
                    </div>
                    <div class="bal-sub">
                        <span>الرصيد الافتتاحي</span>
                        <span>${formatCurrency(acc.daily_balance)} ج.m</span>
                    </div>
                </div>
                
                <div class="account-card-notes">
                    ${acc.notes || '<span class="text-muted">لا توجد ملاحظات خاصة بهذه المحفظة.</span>'}
                </div>
            </div>
            
            <div class="account-card-actions">
                <button class="btn btn-outline btn-sm flex-1" onclick="openEditAccountModal(${JSON.stringify(acc).replace(/"/g, '&quot;')})">تعديل</button>
                <button class="btn btn-outline btn-sm" onclick="toggleAccountStatus(${acc.id}, '${acc.status}')" title="${acc.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}">
                    <i data-lucide="${acc.status === 'active' ? 'slash' : 'check'}"></i>
                </button>
                ${currentUser && currentUser.role === 'admin' ? `
                    <button class="btn btn-danger btn-sm" onclick="deleteAccount(${acc.id})" title="حذف نهائي للرصيد"><i data-lucide="trash-2"></i></button>
                ` : ''}
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function openAddAccountModal() {
    document.getElementById('account-modal-title').textContent = 'إضافة محفظة فودافون كاش جديدة';
    document.getElementById('modal-acc-id').value = '';
    document.getElementById('account-modal-form').reset();
    document.getElementById('modal-acc-submit-btn').textContent = 'إضافة المحفظة';
    document.getElementById('account-modal').classList.add('active');
}

function openEditAccountModal(acc) {
    document.getElementById('account-modal-title').textContent = 'تعديل بيانات محفظة فودافون كاش';
    document.getElementById('modal-acc-id').value = acc.id;
    document.getElementById('modal-acc-name').value = acc.name;
    document.getElementById('modal-acc-phone').value = acc.phone_number;
    document.getElementById('modal-acc-wallet').value = acc.wallet_number;
    document.getElementById('modal-acc-balance').value = acc.current_balance;
    document.getElementById('modal-acc-daily').value = acc.daily_balance;
    document.getElementById('modal-acc-status').value = acc.status;
    document.getElementById('modal-acc-notes').value = acc.notes || '';
    
    document.getElementById('modal-acc-submit-btn').textContent = 'تحديث المحفظة';
    document.getElementById('account-modal').classList.add('active');
}

function closeAccountModal() {
    document.getElementById('account-modal').classList.remove('active');
}

function saveAccount() {
    const id = document.getElementById('modal-acc-id').value;
    const name = document.getElementById('modal-acc-name').value;
    const phone_number = document.getElementById('modal-acc-phone').value;
    const wallet_number = document.getElementById('modal-acc-wallet').value;
    const current_balance = parseFloat(document.getElementById('modal-acc-balance').value);
    const daily_balance = parseFloat(document.getElementById('modal-acc-daily').value);
    const status = document.getElementById('modal-acc-status').value;
    const notes = document.getElementById('modal-acc-notes').value;
    
    const payload = { id, name, phone_number, wallet_number, current_balance, daily_balance, status, notes };
    
    const method = id ? 'PUT' : 'POST';
    
    fetch(`${BASE_URL}/api/accounts`, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(data => { throw new Error(data.error || 'فشل حفظ المحفظة') });
        }
        return res.json();
    })
    .then(data => {
        showToast('تم حفظ المحفظة وتحديث الرصيد بنجاح', 'success');
        closeAccountModal();
        loadAccountsData();
    })
    .catch(err => showToast(err.message, 'error'));
}

function toggleAccountStatus(id, currentStatus) {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    
    fetch(`${BASE_URL}/api/accounts`)
    .then(res => res.json())
    .then(accounts => {
        const acc = accounts.find(a => a.id === id);
        if (acc) {
            acc.status = nextStatus;
            return fetch(`${BASE_URL}/api/accounts`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(acc)
            });
        }
    })
    .then(res => res.json())
    .then(data => {
        showToast('تم تغيير حالة تشغيل المحفظة بنجاح', 'success');
        loadAccountsData();
    })
    .catch(err => showToast(err.message, 'error'));
}

function deleteAccount(id) {
    if (confirm('تنبيه: هل تريد حذف هذه المحفظة نهائياً من السنترال؟ لا يمكن حذف المحافظ التي تحتوي على عمليات مالية سابقة.')) {
        fetch(`${BASE_URL}/api/accounts?id=${id}`, {
            method: 'DELETE'
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => { throw new Error(data.error || 'فشل حذف المحفظة') });
            }
            return res.json();
        })
        .then(data => {
            showToast('تمت إزالة المحفظة من السنترال بنجاح', 'success');
            loadAccountsData();
        })
        .catch(err => showToast(err.message, 'error'));
    }
}

// =========================================================================
// طباعة وتوليد الوصولات (Print Receipt Logic)
// =========================================================================

function printReceipt(opNumber) {
    fetch(`${BASE_URL}/api/operations?q=${opNumber}`)
    .then(res => res.json())
    .then(ops => {
        const op = ops.find(o => o.operation_number === opNumber);
        if (op) {
            document.getElementById('rec-number').textContent = op.operation_number;
            document.getElementById('rec-datetime').textContent = `${op.date} ${op.time}`;
            document.getElementById('rec-employee').textContent = op.employee_name;
            document.getElementById('rec-cust-name').textContent = op.customer_name || 'زبون عام';
            document.getElementById('rec-cust-phone').textContent = op.customer_phone || 'لا يوجد';
            document.getElementById('rec-type').textContent = getArabicOpType(op.operation_type);
            document.getElementById('rec-amount').textContent = `${formatCurrency(op.amount)} ج.م`;
            document.getElementById('rec-commission').textContent = `${formatCurrency(op.commission)} ج.م`;
            
            // فتح المودال وتجهيزه
            document.getElementById('receipt-modal').classList.add('active');
        }
    })
    .catch(err => showToast('خطأ في جلب بيانات إيصال الطباعة: ' + err.message, 'error'));
}

function closeReceiptModal() {
    document.getElementById('receipt-modal').classList.remove('active');
}

function triggerReceiptPrint() {
    window.print();
}

// =========================================================================
// صفحة وتوليد التقارير المالية (Reports Page)
// =========================================================================

function changeReportTab(type, btn) {
    activeReportTab = type;
    
    // تفعيل التاب النشط
    document.querySelectorAll('.report-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const customContainer = document.getElementById('report-custom-date-container');
    if (type === 'custom') {
        customContainer.style.display = 'flex';
    } else {
        customContainer.style.display = 'none';
        generateReport();
    }
}

function generateReport() {
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    
    const params = new URLSearchParams();
    params.append('type', activeReportTab);
    if (activeReportTab === 'custom') {
        if (!startDate || !endDate) {
            showToast('يرجى تحديد فترة التاريخ كاملاً للتوليد المخصص', 'warning');
            return;
        }
        params.append('start_date', startDate);
        params.append('end_date', endDate);
    }
    
    fetch(`${BASE_URL}/api/reports?${params.toString()}`)
    .then(res => res.json())
    .then(data => {
        document.getElementById('report-stat-count').textContent = data.operations_count;
        document.getElementById('report-stat-amount').textContent = formatCurrency(data.total_amount) + ' ج.م';
        document.getElementById('report-stat-commission').textContent = formatCurrency(data.total_commission) + ' ج.م';
        document.getElementById('report-stat-profit').textContent = formatCurrency(data.profit) + ' ج.م';
        
        renderReportTables(data.employee_statistics, data.account_statistics);
    })
    .catch(err => showToast('فشل توليد التقرير المالي: ' + err.message, 'error'));
}

function renderReportTables(empStats, accStats) {
    const empTbody = document.getElementById('report-employee-tbody');
    const accTbody = document.getElementById('report-account-tbody');
    
    // موظفون
    if (empTbody) {
        if (empStats.length === 0) {
            empTbody.innerHTML = '<tr><td colspan="4" class="text-center">لا توجد عمليات للموظفين في هذه الفترة.</td></tr>';
        } else {
            empTbody.innerHTML = '';
            empStats.forEach(s => {
                empTbody.innerHTML += `
                    <tr>
                        <td>${s.employee_name}</td>
                        <td class="bold">${s.count}</td>
                        <td class="bold">${formatCurrency(s.total_amount)} ج.م</td>
                        <td class="bold text-success">${formatCurrency(s.total_commission)} ج.م</td>
                    </tr>
                `;
            });
        }
    }
    
    // محافظ
    if (accTbody) {
        if (accStats.length === 0) {
            accTbody.innerHTML = '<tr><td colspan="4" class="text-center">لا توجد حركات أرصدة للمحافظ في هذه الفترة.</td></tr>';
        } else {
            accTbody.innerHTML = '';
            accStats.forEach(s => {
                accTbody.innerHTML += `
                    <tr>
                        <td>${s.account_name}</td>
                        <td class="bold">${s.count}</td>
                        <td class="bold">${formatCurrency(s.total_amount)} ج.م</td>
                        <td class="bold text-success">${formatCurrency(s.total_commission)} ج.م</td>
                    </tr>
                `;
            });
        }
    }
}

function printReport() {
    window.print();
}

function exportReportToExcel() {
    // توليد ملف Excel / CSV بسيط وسريع للتنزيل
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "الموظف,عدد العمليات,حجم التداول,أرباح العمولات\n";
    
    const rows = document.querySelectorAll('#report-employee-tbody tr');
    if (rows.length === 0 || rows[0].innerText.includes('لا توجد')) {
        showToast('لا توجد بيانات متاحة للتصدير حالياً', 'warning');
        return;
    }
    
    rows.forEach(tr => {
        const cols = tr.querySelectorAll('td');
        const rowData = Array.from(cols).map(c => c.innerText.replace(/,/g, '')).join(',');
        csvContent += rowData + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `تقرير_سنترال_شرف_الدين_${activeReportTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('تم تصدير تقرير الموظفين كملف CSV بنجاح', 'success');
}

function exportHistoryToExcel() {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "رقم العملية,التاريخ,الوقت,الموظف,الزبون,رقم الهاتف,المحفظة,النوع,المبلغ,العمولة\n";
    
    const rows = document.querySelectorAll('#history-tbody tr');
    if (rows.length === 0 || rows[0].innerText.includes('لا توجد')) {
        showToast('لا توجد بيانات متاحة للتصدير حالياً', 'warning');
        return;
    }
    
    rows.forEach(tr => {
        const cols = tr.querySelectorAll('td');
        if (cols.length >= 10) {
            const rowData = [
                cols[0].innerText,
                cols[1].innerText,
                cols[2].innerText,
                cols[3].innerText,
                cols[4].innerText,
                cols[5].innerText,
                cols[6].innerText,
                cols[7].innerText,
                cols[8].innerText.replace(/[^0-9.]/g, ''),
                cols[9].innerText.replace(/[^0-9.]/g, '')
            ].join(',');
            csvContent += rowData + "\n";
        }
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `سجل_عمليات_شرف_الدين_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('تم تصدير سجل العمليات المفلتر كملف CSV بنجاح', 'success');
}

// =========================================================================
// إدارة شؤون الموظفين والصلاحيات (Employees & Logins)
// =========================================================================

function loadEmployeesPage() {
    // 1. جلب الموظفين لجدول التعديل
    fetch(`${BASE_URL}/api/employees`)
    .then(res => res.json())
    .then(users => {
        renderEmployeesTable(users);
    });
    
    // 2. جلب سجل الدخول الأخير
    fetch(`${BASE_URL}/api/login/history`)
    .then(res => res.json())
    .then(history => {
        renderLoginHistoryTable(history);
    });
}

function renderEmployeesTable(users) {
    const tbody = document.getElementById('employees-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="bold">${u.name}</td>
            <td>${u.username}</td>
            <td>${u.role === 'admin' ? 'مدير كامل' : 'كاشير عادي'}</td>
            <td><span class="status-badge ${u.status === 'active' ? 'active' : 'inactive'}">${u.status === 'active' ? 'نشط' : 'موقف'}</span></td>
            <td>
                <div class="btn-actions">
                    <button class="btn btn-outline btn-xs" onclick="editEmployeeInline(${JSON.stringify(u).replace(/"/g, '&quot;')})">تعديل وصلاحيات</button>
                    ${u.username !== 'admin' ? `
                        <button class="btn btn-danger btn-xs" onclick="deleteEmployee(${u.id})">حذف</button>
                    ` : ''}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderLoginHistoryTable(hist) {
    const tbody = document.getElementById('login-history-tbody');
    if (!tbody) return;
    
    if (hist.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">لا توجد سجلات دخول مسجلة.</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    hist.forEach(h => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${h.username}</td>
            <td>${h.login_time}</td>
            <td>${h.ip_address || 'local'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function editEmployeeInline(u) {
    document.getElementById('employee-form-title').innerHTML = `<i data-lucide="edit"></i> تعديل بيانات الموظف: ${u.name}`;
    document.getElementById('emp-id').value = u.id;
    document.getElementById('emp-name').value = u.name;
    document.getElementById('emp-username').value = u.username;
    document.getElementById('emp-password').removeAttribute('required'); // ليس إجباري عند التعديل
    document.getElementById('emp-password').placeholder = 'اتركه فارغاً للاحتفاظ بكلمة المرور';
    document.getElementById('emp-role').value = u.role;
    document.getElementById('emp-status').value = u.status;
    
    // الصلاحيات
    document.getElementById('perm-edit-ops').checked = !!u.permissions.can_edit;
    document.getElementById('perm-delete-ops').checked = !!u.permissions.can_delete;
    document.getElementById('perm-manage-users').checked = !!u.permissions.can_manage_users;
    document.getElementById('perm-backup').checked = !!u.permissions.can_backup;
    
    document.getElementById('cancel-employee-btn').style.display = 'inline-flex';
    document.getElementById('save-employee-btn').textContent = 'تعديل الموظف';
    lucide.createIcons();
}

function resetEmployeeForm() {
    document.getElementById('employee-form-title').innerHTML = `<i data-lucide="user-plus"></i> إضافة موظف جديد`;
    document.getElementById('emp-id').value = '';
    document.getElementById('employee-form').reset();
    document.getElementById('emp-password').setAttribute('required', 'required');
    document.getElementById('emp-password').placeholder = 'أدخل كلمة المرور';
    document.getElementById('cancel-employee-btn').style.display = 'none';
    document.getElementById('save-employee-btn').textContent = 'حفظ الحساب';
}

function saveEmployee() {
    const id = document.getElementById('emp-id').value;
    const name = document.getElementById('emp-name').value;
    const username = document.getElementById('emp-username').value;
    const password = document.getElementById('emp-password').value;
    const role = document.getElementById('emp-role').value;
    const status = document.getElementById('emp-status').value;
    
    // تجميع الصلاحيات
    const permissions = {
        can_edit: document.getElementById('perm-edit-ops').checked,
        can_delete: document.getElementById('perm-delete-ops').checked,
        can_manage_users: document.getElementById('perm-manage-users').checked,
        can_backup: document.getElementById('perm-backup').checked
    };
    
    const payload = { id, name, username, password, role, status, permissions };
    const method = id ? 'PUT' : 'POST';
    
    fetch(`${BASE_URL}/api/employees`, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) {
            return res.json().then(data => { throw new Error(data.error || 'فشل حفظ الموظف') });
        }
        return res.json();
    })
    .then(data => {
        showToast('تم حفظ الموظف وتحديث صلاحياته بنجاح', 'success');
        resetEmployeeForm();
        loadEmployeesPage();
    })
    .catch(err => showToast(err.message, 'error'));
}

function deleteEmployee(id) {
    if (confirm('هل أنت متأكد من حذف هذا الموظف نهائياً؟')) {
        fetch(`${BASE_URL}/api/employees?id=${id}`, {
            method: 'DELETE'
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => { throw new Error(data.error || 'فشل حذف الموظف') });
            }
            return res.json();
        })
        .then(data => {
            showToast('تم حذف الموظف بنجاح من النظام', 'success');
            loadEmployeesPage();
        })
        .catch(err => showToast(err.message, 'error'));
    }
}

function handleRoleChange() {
    const role = document.getElementById('emp-role').value;
    // تحديد الصلاحيات بناء على الرتبة لتسهيل العمل
    if (role === 'admin') {
        document.getElementById('perm-edit-ops').checked = true;
        document.getElementById('perm-delete-ops').checked = true;
        document.getElementById('perm-manage-users').checked = true;
        document.getElementById('perm-backup').checked = true;
    } else {
        document.getElementById('perm-edit-ops').checked = true;
        document.getElementById('perm-delete-ops').checked = false;
        document.getElementById('perm-manage-users').checked = false;
        document.getElementById('perm-backup').checked = false;
    }
}

// =========================================================================
// النسخ الاحتياطي واستعادة البيانات (Backup System)
// =========================================================================

function loadBackupsList() {
    fetch(`${BASE_URL}/api/backup/list`)
    .then(res => res.json())
    .then(files => {
        const tbody = document.getElementById('backups-list-tbody');
        if (!tbody) return;
        
        if (files.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center">لا توجد نسخ احتياطية مسجلة بعد. انقر على زر الإنشاء لعمل أول نسخة.</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        files.forEach(file => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="bold">${file}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="restoreBackup('${file}')">استعادة هذه النسخة</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    })
    .catch(err => {
        showToast('فشل جلب قائمة النسخ الاحتياطية: ' + err.message, 'error');
    });
}

function runManualBackup() {
    fetch(`${BASE_URL}/api/backup/run`, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`تم إنشاء نسخة احتياطية بنجاح باسم: ${data.filename}`, 'success');
            loadBackupsList();
        }
    })
    .catch(err => showToast('فشل إعداد النسخ الاحتياطي: ' + err.message, 'error'));
}

function restoreBackup(filename) {
    if (confirm(`تنبيه خطير للغاية: هل أنت متأكد من استبدال كافة العمليات والحسابات الحالية بالنسخة الاحتياطية: ${filename}؟`)) {
        fetch(`${BASE_URL}/api/backup/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(data.message);
                // إعادة تحميل الجلسة
                window.location.reload();
            } else {
                showToast(data.error, 'error');
            }
        })
        .catch(err => showToast('فشل استعادة قاعدة البيانات: ' + err.message, 'error'));
    }
}

// =========================================================================
// إعدادات النظام وتغيير البيانات العامة (Settings Page)
// =========================================================================

function loadSettingsPage() {
    fetch(`${BASE_URL}/api/settings`)
    .then(res => res.json())
    .then(settings => {
        if (settings.shop_name) {
            document.getElementById('set-shop-name').value = settings.shop_name;
        }
        if (settings.logo_url) {
            document.getElementById('set-logo-url').value = settings.logo_url;
        }
        if (settings.backup_folder) {
            document.getElementById('set-backup-folder').value = settings.backup_folder;
            const displayFolder = document.getElementById('backup-folder-display');
            if (displayFolder) displayFolder.textContent = settings.backup_folder + '/';
        }
    })
    .catch(err => showToast('فشل قراءة إعدادات النظام: ' + err.message, 'error'));
}

function saveSettingsGeneral() {
    const shop_name = document.getElementById('set-shop-name').value;
    const logo_url = document.getElementById('set-logo-url').value;
    const backup_folder = document.getElementById('set-backup-folder').value;
    
    fetch(`${BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_name, logo_url, backup_folder })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('تم حفظ وتحديث إعدادات السنترال العامة بنجاح', 'success');
            // تحديث عناوين المتجر
            document.querySelector('.sidebar-title-info h3').textContent = shop_name;
            loadSettingsPage();
        }
    })
    .catch(err => showToast(err.message, 'error'));
}

function saveSettingsPassword() {
    const newPass = document.getElementById('admin-new-pass').value;
    const confirmPass = document.getElementById('admin-confirm-pass').value;
    
    if (newPass !== confirmPass) {
        showToast('كلمتا المرور غير متطابقتين', 'error');
        return;
    }
    
    // جلب مستخدم admin وتحديث كلمته
    fetch(`${BASE_URL}/api/employees`)
    .then(res => res.json())
    .then(users => {
        const adminUser = users.find(u => u.username === 'admin');
        if (adminUser) {
            adminUser.password = newPass;
            return fetch(`${BASE_URL}/api/employees`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(adminUser)
            });
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('تم تحديث كلمة مرور حساب المدير (admin) بنجاح', 'success');
            document.getElementById('settings-password-form').reset();
        }
    })
    .catch(err => showToast(err.message, 'error'));
}

// =========================================================================
// إغلاق وتسوية اليوم المالي (End Of Day Closing)
// =========================================================================

function checkDailyClosingStatus() {
    fetch(`${BASE_URL}/api/closing`)
    .then(res => res.json())
    .then(closing => {
        todayClosing = closing;
        const bannerTitle = document.getElementById('closing-banner-title');
        const bannerDesc = document.getElementById('closing-banner-desc');
        const banner = document.getElementById('closing-status-banner');
        
        if (closing.status === 'closed') {
            banner.style.backgroundColor = 'var(--light-green)';
            banner.style.borderRightColor = 'var(--primary-green)';
            if (bannerTitle) bannerTitle.textContent = 'اليوم المالي مغلق ومصفى';
            if (bannerDesc) bannerDesc.textContent = `تم إتمام الإغلاق اليومي بنجاح بمجموع عمولات وأرباح: ${formatCurrency(closing.commission)} ج.م.`;
            banner.querySelector('.banner-left').innerHTML = `
                <button class="btn btn-outline" onclick="printDailyClosingReport()">
                    <i data-lucide="printer"></i>
                    <span>طباعة تقرير الإغلاق المالي</span>
                </button>
            `;
        } else {
            banner.style.backgroundColor = 'var(--light-blue)';
            banner.style.borderRightColor = 'var(--secondary-blue)';
            if (bannerTitle) bannerTitle.textContent = 'اليوم المالي مفتوح حالياً';
            if (bannerDesc) bannerDesc.textContent = 'رصيد البداية مسجل وجاري تتبع العمليات حالياً.';
            banner.querySelector('.banner-left').innerHTML = `
                <button class="btn btn-success" onclick="openClosingModal()">
                    <i data-lucide="lock"></i>
                    <span>إقفال اليوم المالي (تصفية)</span>
                </button>
            `;
        }
        lucide.createIcons();
    });
}

function openClosingModal() {
    fetch(`${BASE_URL}/api/closing`)
    .then(res => res.json())
    .then(data => {
        document.getElementById('close-date').value = data.date;
        document.getElementById('close-ops-count').value = data.operations_count;
        document.getElementById('close-opening-bal').value = data.opening_balance.toFixed(2);
        document.getElementById('close-expected-bal').value = data.closing_balance.toFixed(2);
        document.getElementById('close-comm-total').value = data.commission.toFixed(2);
        document.getElementById('close-actual-cash').value = '';
        document.getElementById('close-diff').value = '0.00';
        document.getElementById('close-diff-help').textContent = '';
        
        document.getElementById('closing-modal').classList.add('active');
    });
}

function closeClosingModal() {
    document.getElementById('closing-modal').classList.remove('active');
}

function calculateCashDifference() {
    const expected = parseFloat(document.getElementById('close-expected-bal').value) || 0;
    const actual = parseFloat(document.getElementById('close-actual-cash').value) || 0;
    const diffEl = document.getElementById('close-diff');
    const helpEl = document.getElementById('close-diff-help');
    
    if (!diffEl || !helpEl) return;
    
    const diff = actual - expected;
    diffEl.value = diff.toFixed(2);
    
    if (diff === 0) {
        diffEl.style.color = 'var(--primary-green)';
        helpEl.textContent = 'مطابق ولا توجد فروقات صندوق!';
        helpEl.style.color = 'var(--primary-green)';
    } else if (diff < 0) {
        diffEl.style.color = 'var(--danger-red)';
        helpEl.textContent = `عجز في الدرج بقيمة: ${formatCurrency(Math.abs(diff))} جنيه`;
        helpEl.style.color = 'var(--danger-red)';
    } else {
        diffEl.style.color = 'var(--primary-green)';
        helpEl.textContent = `زيادة فائضة في الدرج بقيمة: ${formatCurrency(diff)} جنيه`;
        helpEl.style.color = 'var(--primary-green)';
    }
}

function submitDailyClosing() {
    const date = document.getElementById('close-date').value;
    const opening_balance = parseFloat(document.getElementById('close-opening-bal').value);
    const closing_balance = parseFloat(document.getElementById('close-expected-bal').value);
    const operations_count = parseInt(document.getElementById('close-ops-count').value);
    const commission = parseFloat(document.getElementById('close-comm-total').value);
    const profit = commission;
    const cash_difference = parseFloat(document.getElementById('close-diff').value);
    const notes = document.getElementById('close-notes').value;
    
    const payload = { date, opening_balance, closing_balance, operations_count, commission, profit, cash_difference, notes };
    
    fetch(`${BASE_URL}/api/closing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(data.message, 'success');
            closeClosingModal();
            loadDashboardData();
            
            // خيار فوري لطباعة تقرير الإغلاق المالي
            if (confirm('هل تريد طباعة تقرير تسوية اليوم المالي وإقفال الصندوق الآن؟')) {
                printDailyClosingReport();
            }
        }
    })
    .catch(err => showToast('فشل تصفية اليوم المالي: ' + err.message, 'error'));
}

function printDailyClosingReport() {
    // جلب بيانات الإقفال المسجلة اليوم وطباعتها بطريقة الفاتورة
    fetch(`${BASE_URL}/api/closing`)
    .then(res => res.json())
    .then(data => {
        document.getElementById('rec-number').textContent = `CLOSE-${data.date}`;
        document.getElementById('rec-datetime').textContent = `${data.date} 23:59:59`;
        document.getElementById('rec-employee').textContent = 'المدير العام';
        document.getElementById('rec-cust-name').textContent = 'تقرير إغلاق يومي';
        document.getElementById('rec-cust-phone').textContent = 'سنترال شرف الدين';
        document.getElementById('rec-type').textContent = 'تصفية وإقفال الصندوق';
        document.getElementById('rec-amount').textContent = `رصيد ختامي: ${formatCurrency(data.closing_balance)} ج.م`;
        document.getElementById('rec-commission').textContent = `ربح العمولات: ${formatCurrency(data.commission)} ج.م`;
        
        document.getElementById('receipt-modal').classList.add('active');
        setTimeout(() => {
            window.print();
        }, 300);
    });
}

// =========================================================================
// بحث سريع شامل (Global Search Controller)
// =========================================================================

function handleGlobalSearch(query) {
    const dropdown = document.getElementById('global-search-results');
    if (!dropdown) return;
    
    if (query.trim().length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    fetch(`${BASE_URL}/api/operations?q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(ops => {
        if (ops.length === 0) {
            dropdown.innerHTML = '<div style="padding:15px; font-size:12px; color:var(--text-muted); text-align:center;">لا توجد نتائج تطابق بحثك...</div>';
        } else {
            dropdown.innerHTML = '';
            // عرض أول 5 نتائج فقط لتفادي الازدحام
            ops.slice(0, 5).forEach(op => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.onclick = () => {
                    dropdown.style.display = 'none';
                    document.getElementById('global-search-input').value = '';
                    printReceipt(op.operation_number);
                };
                
                item.innerHTML = `
                    <div>
                        <div class="search-result-title">${op.operation_number} - ${op.customer_name || 'عميل'}</div>
                        <div class="search-result-subtitle">${op.customer_phone} | محفظة: ${op.account_name}</div>
                    </div>
                    <span class="search-result-badge ${getOpTypeClass(op.operation_type)}">${formatCurrency(op.amount)}ج.م</span>
                `;
                dropdown.appendChild(item);
            });
        }
        dropdown.style.display = 'block';
    })
    .catch(() => {
        dropdown.style.display = 'none';
    });
}

// =========================================================================
// أدوات مساعدة إضافية (Widgets: Calculator, Quick Operations)
// =========================================================================

function openCalculator() {
    document.getElementById('calculator-widget').style.display = 'block';
}

function closeCalculator() {
    document.getElementById('calculator-widget').style.display = 'none';
}

function calcInput(char) {
    const screen = document.getElementById('calc-screen');
    if (screen) screen.value += char;
}

function calcClear() {
    const screen = document.getElementById('calc-screen');
    if (screen) screen.value = '';
}

function calcBack() {
    const screen = document.getElementById('calc-screen');
    if (screen) screen.value = screen.value.slice(0, -1);
}

function calcEqual() {
    const screen = document.getElementById('calc-screen');
    if (screen) {
        try {
            // استخدام eval آمن فقط للأرقام والعمليات الرياضية البسيطة
            const val = screen.value.replace(/[^0-9+\-*/.]/g, '');
            screen.value = Function(`"use strict"; return (${val})`)();
        } catch (e) {
            screen.value = 'Error';
        }
    }
}

function calcSuggestedCommHelper() {
    const amountVal = parseFloat(document.getElementById('calc-helper-amount').value) || 0;
    const resEl = document.getElementById('calc-helper-result');
    if (!resEl) return;
    
    // نفس قاعدة العمولة المقترحة للإيداع
    let suggested = 0;
    if (amountVal > 0) {
        if (amountVal <= 100) suggested = 5.0;
        else if (amountVal <= 500) suggested = 10.0;
        else if (amountVal <= 1000) suggested = 15.0;
        else suggested = Math.ceil(amountVal * 0.015);
    }
    
    resEl.textContent = `عمولة: ${suggested} ج.م`;
}

function openQuickOperation() {
    document.getElementById('quick-op-modal').classList.add('active');
}

function closeQuickOperation() {
    document.getElementById('quick-op-modal').classList.remove('active');
}

function triggerQuickAction(type) {
    closeQuickOperation();
    navigateTo('new-operation');
    
    setTimeout(() => {
        const typeSelect = document.getElementById('op-type-select');
        if (typeSelect) {
            typeSelect.value = type;
            handleOpTypeChange();
        }
    }, 300);
}

// =========================================================================
// دوال وتنسيق عام للمشروع (Helper functions)
// =========================================================================

function formatCurrency(val) {
    return parseFloat(val).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getArabicOpType(type) {
    const dict = {
        'withdrawal': 'سحب كاش',
        'deposit': 'إيداع رصيد',
        'transfer': 'تحويل رصيد',
        'bill_payment': 'دفع فواتير',
        'inquiry': 'استعلام رصيد',
        'transfer_in': 'استلام داخلي',
        'transfer_out': 'تحويل داخلي'
    };
    return dict[type] || type;
}

function getOpTypeClass(type) {
    const dict = {
        'withdrawal': 'status-badge active', // أخضر
        'deposit': 'status-badge inactive', // أحمر
        'transfer': 'status-badge inactive', // أحمر
        'bill_payment': 'status-badge warning', // ذهبي
        'inquiry': 'status-badge active',
        'transfer_in': 'status-badge active',
        'transfer_out': 'status-badge inactive'
    };
    return dict[type] || 'status-badge';
}
