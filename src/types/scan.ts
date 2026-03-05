export type ScanStatus =
  | "QUEUED"
  | "CLONING"
  | "DETECTING"
  | "ANALYZING"
  | "SCANNING_SECRETS"
  | "SCANNING_DEPS"
  | "AI_REVIEW"
  | "GENERATING_REPORT"
  | "COMPLETED"
  | "FAILED";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type FindingStatus = "OPEN" | "FIXED" | "DISMISSED";

export interface FindingData {
  category: string;
  severity: Severity;
  title: string;
  description: string;
  plainTitle?: string;
  plainDescription?: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  codeSnippet?: string;
  fixSuggestion?: string;
  fixCode?: string;
  cursorPromptShort?: string;
  cursorPromptDetailed?: string;
  detectedBy: string;
  fingerprint: string;
}

export interface ScanResult {
  id: string;
  repoUrl: string;
  repoName: string;
  scanMode: "quick" | "deep";
  status: ScanStatus;
  progress: number;
  progressMessage?: string;
  overallScore?: number;
  summary?: string;
  languages: string[];
  frameworks: string[];
  findings: FindingResult[];
  commitSha?: string;
  parentScanId?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface FindingResult {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  description: string;
  plainTitle?: string;
  plainDescription?: string;
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  codeSnippet?: string;
  fixSuggestion?: string;
  fixCode?: string;
  cursorPromptShort?: string;
  cursorPromptDetailed?: string;
  detectedBy: string;
  status: FindingStatus;
  fingerprint: string;
}

export interface ScanProgress {
  status: ScanStatus;
  progress: number;
  message: string;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export const CATEGORY_LABELS_PLAIN: Record<string, string> = {
  missing_lockfile: "Your App's Building Blocks Aren't Locked Down",
  unpinned_deps: "Some Building Blocks Can Change Without Warning",
  unpinned_actions: "Your Automated Workflows Could Be Tampered With",
  injection: "Attackers Could Run Harmful Commands on Your System",
  xss: "Hackers Could Inject Malicious Content Into Your Pages",
  ssrf: "Your Server Could Be Tricked Into Accessing Internal Systems",
  csrf: "Fake Requests Could Be Made on Behalf of Your Users",
  security_headers: "Your App Is Missing Important Safety Shields",
  hardcoded_secrets: "Passwords or Secret Keys Are Visible in Your Code",
  broken_auth: "Users Might Access Things They Shouldn't",
  business_logic: "Your App's Rules Could Be Tricked or Bypassed",
  log_injection: "Attackers Could Fake Your App's Activity Logs",
  input_validation: "Your App Doesn't Check If User Input Is Safe",
  insecure_api: "Your App Uses Outdated or Unsafe Methods",
  rate_limiting: "Your App Can Be Overwhelmed With Too Many Requests",
  command_injection: "Attackers Could Run Harmful Commands Through Your App",
  path_traversal: "Attackers Could Access Files They Shouldn't See",
  insecure_deserialization: "Harmful Data Could Be Disguised as Safe",
  file_upload: "Dangerous Files Could Be Uploaded to Your App",
  exposed_config: "Sensitive Settings Are Accessible to the Public",
  insecure_transport: "Data Is Being Sent Without Encryption",
  weak_auth: "Login Security Is Too Easy to Bypass",
  idor: "Users Could Access Other People's Private Data",
  mass_assignment: "Users Could Modify Data They Shouldn't Have Access To",
  open_redirect: "Your App Could Send Users to Malicious Websites",
  vulnerable_deps: "You're Using Components With Known Security Flaws",
  error_handling: "Error Messages Reveal Sensitive Information",
  n_plus_one: "Your App Makes Way Too Many Database Requests",
  missing_pagination: "Your App Tries to Load Everything at Once",
  missing_caching: "Your App Doesn't Remember Data It Already Looked Up",
  memory_leak: "Your App Slowly Uses More and More Memory Over Time",
  race_condition: "Simultaneous Actions Could Cause Unexpected Results",
  unhandled_errors: "Your App Doesn't Handle Failures Gracefully",
  missing_indexes: "Your Database Searches Are Slower Than They Need to Be",
  missing_connection_pool: "Your Database Connections Aren't Being Shared Efficiently",
  blocking_operations: "Your App Freezes While Waiting for Slow Tasks",
  missing_timeout: "Your App Waits Forever for Things That Might Never Respond",
  unbounded_fetch: "Your App Tries to Load Unlimited Amounts of Data",
};

export const CATEGORY_LABELS: Record<string, string> = {
  missing_lockfile: "Missing Lockfile",
  unpinned_deps: "Unpinned / Wildcard Dependencies",
  unpinned_actions: "Unpinned GitHub Actions",
  injection: "Injection (SQL/NoSQL/Command)",
  xss: "Cross-Site Scripting (XSS)",
  ssrf: "Server-Side Request Forgery (SSRF)",
  csrf: "Missing CSRF Protection",
  security_headers: "Missing Security Headers",
  hardcoded_secrets: "Hardcoded Secrets / API Keys",
  broken_auth: "Broken Authorization Logic",
  business_logic: "Business Logic Flaws",
  log_injection: "Log Injection",
  input_validation: "Missing Input Validation",
  insecure_api: "Insecure / Deprecated API Usage",
  rate_limiting: "Missing Rate Limiting",
  command_injection: "Command Injection",
  path_traversal: "Path Traversal",
  insecure_deserialization: "Insecure Deserialization",
  file_upload: "Insecure File Uploads",
  exposed_config: "Exposed Config / .env Files",
  insecure_transport: "Missing HTTPS / Insecure Transport",
  weak_auth: "Weak Authentication",
  idor: "Insecure Direct Object References (IDOR)",
  mass_assignment: "Mass Assignment",
  open_redirect: "Open Redirects",
  vulnerable_deps: "Insecure Dependencies (CVEs)",
  error_handling: "Missing Error Handling / Info Leakage",
  n_plus_one: "N+1 Query Problems",
  missing_pagination: "Missing Pagination",
  missing_caching: "Missing Caching Strategy",
  memory_leak: "Memory Leaks",
  race_condition: "Race Conditions",
  unhandled_errors: "Unhandled API/Promise Failures",
  missing_indexes: "Missing Database Indexes",
  missing_connection_pool: "Missing Connection Pooling",
  blocking_operations: "Synchronous Blocking Operations",
  missing_timeout: "Missing Timeout Configuration",
  unbounded_fetch: "Unbounded Data Fetching",
};
