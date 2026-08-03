-- Correct 2025/26 values and add the current 2026/27 UK tax year.
-- Figures verified against GOV.UK current/past Income Tax, self-employed NI,
-- student loan, dividend and VAT rate pages.
UPDATE tax_year_config
SET blind_persons_allowance = 3130,
    class2_weekly_rate = 3.50,
    class2_small_profits_threshold = 6845,
    student_loan_plan1_threshold = 26065,
    updated_at = datetime('now')
WHERE tax_year = '2025/26';

INSERT OR IGNORE INTO tax_year_config (
    tax_year, year_start, year_end,
    personal_allowance, basic_rate_percent, basic_rate_upper,
    higher_rate_percent, higher_rate_upper, additional_rate_percent,
    pa_taper_start, pa_taper_rate, blind_persons_allowance,
    class2_weekly_rate, class2_small_profits_threshold,
    class4_lower_threshold, class4_upper_threshold,
    class4_main_rate_percent, class4_upper_rate_percent,
    vat_registration_threshold, vat_deregistration_threshold,
    student_loan_plan1_threshold, student_loan_plan2_threshold,
    student_loan_plan4_threshold, student_loan_postgrad_threshold,
    dividend_allowance, dividend_basic_rate, dividend_higher_rate,
    dividend_additional_rate
) VALUES (
    '2026/27', '2026-04-06', '2027-04-05',
    12570, 20, 50270,
    40, 125140, 45,
    100000, 0.5, 3250,
    3.65, 7105,
    12570, 50270,
    6, 2,
    90000, 88000,
    26900, 29385,
    33795, 21000,
    500, 10.75, 35.75,
    39.35
);

UPDATE app_settings
SET value = '2026/27'
WHERE key = 'current_tax_year' AND value = '2025/26';