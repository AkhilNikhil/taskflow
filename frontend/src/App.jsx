import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";
import { apiRequest, BASE_API_URL, DIRECT_BACKEND_URL } from "./api";
import "./App.css";
import TaskEditModal from "./components/TaskEditModal";
import ProfileModal from "./components/ProfileModal";
import ChatMessages from "./components/ChatMessages";
import DmStatusBar from "./components/DmStatusBar";

export default function App() {
  // Auth state
  const [session, setSession] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);

  // App & Dashboard state
  const [backendStatus, setBackendStatus] = useState("checking");
  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [activeTab, setActiveTab] = useState("my"); // "my", "teams", "org"
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilterTeamId, setSelectedFilterTeamId] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // "all", "pending", "completed"
  const [appMessage, setAppMessage] = useState("");

  // Create Task state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState("MEDIUM");
  const [taskTeamId, setTaskTeamId] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [workspaceUsers, setWorkspaceUsers] = useState([]);
  const [selectedUserOverviewId, setSelectedUserOverviewId] = useState(null);
  const [userOverviewSearch, setUserOverviewSearch] = useState("");
  const [userOverviewStatusFilter, setUserOverviewStatusFilter] = useState("all");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkLines, setBulkLines] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Create Team modal state
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [selectedTeamDetail, setSelectedTeamDetail] = useState(null);
  const [isLoadingTeamDetail, setIsLoadingTeamDetail] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("MEMBER");
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Admin Panel state (Architect only)
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [isLoadingAdminUsers, setIsLoadingAdminUsers] = useState(false);
  const [isUpdatingUserRole, setIsUpdatingUserRole] = useState(false);

  // Chat & Communication state
  const [showChatModal, setShowChatModal] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingChatMessages, setIsLoadingChatMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatFilterTab, setChatFilterTab] = useState("all"); // "all", "team", "direct"
  const [showNewDirectModal, setShowNewDirectModal] = useState(false);
  const [directChatEmail, setDirectChatEmail] = useState("");
  const [directChatError, setDirectChatError] = useState("");
  const [mobileChatTab, setMobileChatTab] = useState("channels"); // "channels" or "chat"


  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [latestToast, setLatestToast] = useState(null);

  // --- new UI state ---
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") ||
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
  const [isRecovery, setIsRecovery] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [editingTeam, setEditingTeam] = useState(false);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDesc, setEditTeamDesc] = useState("");
  const [syncRetry, setSyncRetry] = useState(0);
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [editingTaskItem, setEditingTaskItem] = useState(null);
  const [highlightTaskId, setHighlightTaskId] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [chatUnreadTotal, setChatUnreadTotal] = useState(0);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  // --- refs ---
  const backendStatusRef = useRef("checking");
  const healthTimer = useRef(null);
  const syncingRef = useRef(false);
  const syncFailures = useRef(0);
  const lastSeenNotifId = useRef(null);
  const chatEndRef = useRef(null);
  const chatLastTs = useRef(null);
  const lastMsgIdRef = useRef(null);
  const wakeStartRef = useRef(Date.now());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const onBlocked = async (e) => {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("SignOut error:", err);
      } finally {
        setSession(null);
        setUserProfile(null);
        setTasks([]);
        setTeams([]);
        setAuthPassword("");
        setAuthConfirmPassword("");
      }
      setAuthMessage(`⛔ ${e.detail}. Please contact your administrator.`);
    };
    window.addEventListener("account-blocked", onBlocked);
    return () => window.removeEventListener("account-blocked", onBlocked);
  }, []);

  // ----------------------------------------------------
  // 1. BACKEND HEALTH CHECK & SMART WAKE-UP
  // ----------------------------------------------------
  const [wakeUpSeconds, setWakeUpSeconds] = useState(0);

  const setStatus = useCallback((s) => {
    backendStatusRef.current = s;
    setBackendStatus(s);
  }, []);

  const probe = async (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const wakeBackend = useCallback(() => {
    if (!DIRECT_BACKEND_URL) return;
    // Equivalent to opening the backend link: Render holds this request while the app boots.
    fetch(`${DIRECT_BACKEND_URL}/api/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
  }, []);

  const checkHealth = useCallback(async (retryCount = 0) => {
    clearTimeout(healthTimer.current);
    if (retryCount === 0) wakeStartRef.current = Date.now();
    if (retryCount === 0 && backendStatusRef.current !== "connected") {
      setStatus("checking");
      setWakeUpSeconds(0);
      wakeBackend();                       // kick the sleeping backend right away
    }

    let ok = await probe(`${BASE_API_URL}/api/health`);
    if (!ok && DIRECT_BACKEND_URL) ok = await probe(`${DIRECT_BACKEND_URL}/api/health`);

    if (ok) {
      setStatus("connected");
      setWakeUpSeconds(0);
      return true;
    }

    const elapsed = Date.now() - wakeStartRef.current;
    if (elapsed < 240000) {                // keep trying for up to 4 minutes
      setStatus("waking up");
      setWakeUpSeconds(Math.round(elapsed / 1000));
      if (retryCount > 0 && retryCount % 4 === 0) wakeBackend();
      healthTimer.current = setTimeout(() => checkHealth(retryCount + 1), 3000);
    } else {
      setStatus("offline");
    }
    return false;
  }, [setStatus, wakeBackend]);

  const getStatusLabel = () => {
    if (backendStatus === "connected") return "Online";
    if (backendStatus === "waking up" || backendStatus === "retrying") {
      return `Waking up backend (${wakeUpSeconds}s — can take up to 2 min)...`;
    }
    if (backendStatus === "checking") return "Connecting...";
    return "Offline";
  };

  useEffect(() => {
    checkHealth(0);
    const interval = setInterval(() => {
      if (backendStatusRef.current === "connected") checkHealth(0);
    }, 60000);
    return () => {
      clearInterval(interval);
      clearTimeout(healthTimer.current);
    };
  }, [checkHealth]);

  // Once the backend is up and we have a session but no profile yet, sync it
  useEffect(() => {
    if (backendStatus === "connected" && session && !userProfile) {
      syncProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendStatus, session?.user?.id, userProfile, syncRetry]);

  // ----------------------------------------------------
  // 2. SUPABASE AUTH SESSION MANAGEMENT
  // ----------------------------------------------------
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const errorDesc = hashParams.get("error_description") || queryParams.get("error_description");
    if (errorDesc) {
      setAuthMessage("Email Verification: " + decodeURIComponent(errorDesc.replace(/\+/g, " ")));
      setShowResendVerification(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);            // NO async work in here
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
      if (!session) {
        syncFailures.current = 0;
        setUserProfile(null);
        setTasks([]);
        setTeams([]);
        setAuthPassword("");
        setAuthConfirmPassword("");
      } else if (window.location.hash || window.location.search.includes("code=")) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      setIsAuthChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const syncProfile = async () => {
    if (syncingRef.current) return;           // never run two syncs in parallel
    syncingRef.current = true;
    try {
      await apiRequest("/api/auth/sync", { method: "POST", body: JSON.stringify({}) });
      const meData = await apiRequest("/api/auth/me");
      setUserProfile(meData.user);
      setAppMessage(null);
      syncFailures.current = 0;
      loadTasks();
      loadTeams();
      loadWorkspaceUsers();
    } catch (err) {
      console.error("Profile sync failed:", err);
      if (backendStatusRef.current === "connected") {
        setAppMessage("Profile sync notice: " + (err.message || "Failed to sync"));
      }
      if (syncFailures.current < 5) {        // retry a few times, then stop
        syncFailures.current += 1;
        setTimeout(() => setSyncRetry((n) => n + 1), 5000);
      }
    } finally {
      syncingRef.current = false;
    }
  };

  const loadWorkspaceUsers = async () => {
    try {
      const data = await apiRequest("/api/auth/users");
      setWorkspaceUsers(data.users || []);
    } catch (err) {
      console.error("Failed to load workspace users:", err);
    }
  };

  // ----------------------------------------------------
  // 3. DATA LOADING (TASKS & TEAMS)
  // ----------------------------------------------------
  const loadTasks = async () => {
    setIsLoadingTasks(true);
    try {
      const data = await apiRequest("/api/tasks");
      setTasks(data.tasks || []);
    } catch (err) {
      setAppMessage(err.message || "Failed to load tasks");
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const loadTeams = async () => {
    try {
      const data = await apiRequest("/api/teams");
      setTeams(data.teams || []);
    } catch (err) {
      console.error("Failed to load teams:", err);
    }
  };

  // ----------------------------------------------------
  // 4. AUTH ACTIONS (LOGIN, SIGN UP, LOGOUT)
  // ----------------------------------------------------
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");
    setShowResendVerification(false);

    try {
      if (!isLoginMode && authPassword !== authConfirmPassword) {
        throw new Error("Passwords do not match.");
      }

      if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) {
          const lowerMsg = (error.message || "").toLowerCase();
          if (lowerMsg.includes("email not confirmed")) {
            setShowResendVerification(true);
            throw new Error(
              "⚠️ Your email address is not verified yet. Please check your inbox and spam folder, or click below to resend."
            );
          }
          if (lowerMsg.includes("banned")) {
            throw new Error("⛔ Your account has been suspended. Please contact your administrator.");
          }
          throw error;
        }
        setAuthPassword("");
        setAuthConfirmPassword("");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            data: { display_name: authDisplayName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;

        // Detect if user already exists (Supabase returns empty identities array for existing users)
        if (
          data?.user &&
          Array.isArray(data?.user?.identities) &&
          data.user.identities.length === 0
        ) {
          setAuthMessage(
            "⚠️ An account with this email already exists! Please sign in with your password instead."
          );
          setIsLoginMode(true);
          setAuthLoading(false);
          return;
        }

        if (data?.user && !data.session) {
          setAuthMessage(
            "🎉 Account created! A confirmation email has been sent to " +
              authEmail.trim() +
              ". Please check your inbox (and spam folder) and click the link to activate your account."
          );
          setIsLoginMode(true);
          setShowResendVerification(true);
          setAuthLoading(false);
          return;
        }
      }
    } catch (err) {
      setAuthMessage(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!authEmail.trim()) {
      setAuthMessage("Please enter your email address above to resend verification.");
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: authEmail.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setAuthMessage(
        "✅ Verification email resent to " +
          authEmail.trim() +
          "! Please check your inbox and spam folder."
      );
      setShowResendVerification(false);
    } catch (err) {
      setAuthMessage(err.message || "Failed to resend verification email.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("SignOut error:", err);
    } finally {
      setSession(null);
      setUserProfile(null);
      setTasks([]);
      setTeams([]);
      setAuthPassword("");
      setAuthConfirmPassword("");
      try {
        const legacyKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase"))) legacyKeys.push(k);
        }
        legacyKeys.forEach((k) => localStorage.removeItem(k));
        const sKeys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase"))) sKeys.push(k);
        }
        sKeys.forEach((k) => sessionStorage.removeItem(k));
      } catch {
        /* ignore */
      }
    }
  };

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const handleForgotPassword = async () => {
    if (!authEmail.trim()) {
      setAuthMessage("Type your email above first, then click 'Forgot password?'.");
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setAuthMessage("If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.");
    } catch (err) {
      setAuthMessage(err.message || "Could not send the reset email.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setAuthMessage("Password must be at least 6 characters.");
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setIsRecovery(false);
      setAuthMessage("");
      setAppMessage("Password updated successfully.");
    } catch (err) {
      setAuthMessage(err.message || "Could not update password.");
    } finally {
      setAuthLoading(false);
    }
  };

  // ----------------------------------------------------
  // 5. TASK ACTIONS
  // ----------------------------------------------------
  const handleCreateTask = async (e) => {
    e.preventDefault();
    setIsCreatingTask(true);
    setAppMessage("");

    try {
      if (isBulkMode) {
        // Bulk creation (split lines, up to 10)
        const lines = bulkLines
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          throw new Error("Enter at least one task title for bulk creation");
        }
        if (lines.length > 10) {
          throw new Error("Bulk creation is capped at a maximum of 10 tasks per request");
        }

        const bulkPayload = lines.map((title) => ({
          title,
          priority: taskPriority,
          assigned_team_id: taskTeamId || null,
          assigned_user_id: taskAssigneeId || null,
        }));

        await apiRequest("/api/tasks", {
          method: "POST",
          body: JSON.stringify(bulkPayload),
        });

        setBulkLines("");
        setIsBulkMode(false);
        setAppMessage(`Successfully created ${lines.length} tasks!`);
      } else {
        if (!taskTitle.trim()) {
          throw new Error("Task title is required");
        }

        await apiRequest("/api/tasks", {
          method: "POST",
          body: JSON.stringify({
            title: taskTitle.trim(),
            description: taskDesc.trim() || null,
            due_date: taskDueDate || null,
            priority: taskPriority,
            assigned_team_id: taskTeamId || null,
            assigned_user_id: taskAssigneeId || null,
          }),
        });

        setTaskTitle("");
        setTaskDesc("");
        setTaskDueDate("");
        setAppMessage("Task created successfully!");
      }

      setTaskTeamId("");
      setTaskAssigneeId("");
      await loadTasks();
    } catch (err) {
      setAppMessage(err.message || "Failed to create task");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleToggleComplete = async (task) => {
    const nextStatus = task.status === "COMPLETED" ? "IN_PROGRESS" : "COMPLETED";
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });
      loadTasks();
    } catch (err) {
      setAppMessage(err.message || "Failed to update task");
    }
  };

  const handleClaimTask = async (task) => {
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({ claim: true }),
      });
      setAppMessage(`Claimed task "${task.title}"!`);
      loadTasks();
    } catch (err) {
      setAppMessage(err.message || "Failed to claim task");
    }
  };

  const handleDeleteTask = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try {
      await apiRequest(`/api/tasks/${task.id}`, { method: "DELETE" });
      setAppMessage("Task deleted");
      loadTasks();
    } catch (err) {
      setAppMessage(err.message || "Failed to delete task");
    }
  };

  const handleChangeStatus = async (task, status) => {
    try {
      await apiRequest(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ status }) });
      loadTasks();
    } catch (err) {
      setAppMessage(err.message || "Failed to update status");
    }
  };

  const handleSaveTaskEdit = async (taskId, fields) => {
    await apiRequest(`/api/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(fields) });
    setEditingTaskItem(null);
    setAppMessage("Task updated");
    await loadTasks();
  };

  // ----------------------------------------------------
  // 6. TEAM ACTIONS
  // ----------------------------------------------------
  const handleSelectTeam = async (team) => {
    setEditingTeam(false);
    setIsLoadingTeamDetail(true);
    try {
      const data = await apiRequest(`/api/teams/${team.id}`);
      setSelectedTeamDetail(data.team);
    } catch (err) {
      setAppMessage(err.message || "Failed to load team details");
    } finally {
      setIsLoadingTeamDetail(false);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    setIsCreatingTeam(true);
    try {
      const res = await apiRequest("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: newTeamName.trim(),
          description: newTeamDesc.trim() || null,
        }),
      });
      setNewTeamName("");
      setNewTeamDesc("");
      setAppMessage("Team created successfully! You can now invite teammates below.");
      await loadTeams();
      if (res.team) {
        handleSelectTeam(res.team);
      }
    } catch (err) {
      setAppMessage(err.message || "Failed to create team");
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedTeamDetail || !newMemberEmail.trim()) return;

    setIsAddingMember(true);
    try {
      const res = await apiRequest(`/api/teams/${selectedTeamDetail.id}/members`, {
        method: "POST",
        body: JSON.stringify({
          email: newMemberEmail.trim(),
          team_role: newMemberRole,
        }),
      });
      setAppMessage(res.message || "Member added successfully");
      setNewMemberEmail("");
      const refreshed = await apiRequest(`/api/teams/${selectedTeamDetail.id}`);
      setSelectedTeamDetail(refreshed.team);
      loadTeams();
    } catch (err) {
      setAppMessage(err.message || "Failed to add member. Note: The teammate must register their account first.");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberUserId, memberName) => {
    if (!selectedTeamDetail) return;
    if (!window.confirm(`Remove ${memberName || "this user"} from ${selectedTeamDetail.name}?`)) return;

    try {
      await apiRequest(`/api/teams/${selectedTeamDetail.id}/members/${memberUserId}`, {
        method: "DELETE",
      });
      setAppMessage("Member removed from team");
      const refreshed = await apiRequest(`/api/teams/${selectedTeamDetail.id}`);
      setSelectedTeamDetail(refreshed.team);
      loadTeams();
    } catch (err) {
      setAppMessage(err.message || "Failed to remove member");
    }
  };

  const refreshSelectedTeam = async () => {
    const refreshed = await apiRequest(`/api/teams/${selectedTeamDetail.id}`);
    setSelectedTeamDetail(refreshed.team);
    loadTeams();
  };

  const handleSaveTeamEdit = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(`/api/teams/${selectedTeamDetail.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editTeamName.trim(), description: editTeamDesc.trim() }),
      });
      setEditingTeam(false);
      setAppMessage("Team updated");
      await refreshSelectedTeam();
    } catch (err) {
      setAppMessage(err.message || "Failed to update team");
    }
  };

  const handleDeleteTeam = async () => {
    if (!window.confirm(`Delete team "${selectedTeamDetail.name}"?\nIts tasks become personal tasks and its chat channel is removed.`)) return;
    try {
      await apiRequest(`/api/teams/${selectedTeamDetail.id}`, { method: "DELETE" });
      setSelectedTeamDetail(null);
      setAppMessage("Team deleted");
      loadTeams();
      loadTasks();
    } catch (err) {
      setAppMessage(err.message || "Failed to delete team");
    }
  };

  const handleSetMemberRole = async (member, role) => {
    try {
      const res = await apiRequest(`/api/teams/${selectedTeamDetail.id}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: member.user_id, team_role: role }),
      });
      setAppMessage(res.message || "Role updated");
      await refreshSelectedTeam();
    } catch (err) {
      setAppMessage(err.message || "Failed to change role");
    }
  };

  // ----------------------------------------------------
  // 6.1. ADMIN ACTIONS (ARCHITECT ONLY)
  // ----------------------------------------------------
  const loadAdminUsers = async () => {
    setIsLoadingAdminUsers(true);
    try {
      const data = await apiRequest("/api/admin/users");
      setAdminUsers(data.users || []);
    } catch (err) {
      setAppMessage(err.message || "Failed to load system users");
    } finally {
      setIsLoadingAdminUsers(false);
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    setIsUpdatingUserRole(true);
    try {
      const res = await apiRequest(`/api/admin/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ system_role: newRole }),
      });
      setAppMessage(res.message || `Role updated to ${newRole}`);
      await loadAdminUsers();
    } catch (err) {
      setAppMessage(err.message || "Failed to update role");
    } finally {
      setIsUpdatingUserRole(false);
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setIsUpdatingUserRole(true);
    try {
      const res = await apiRequest(`/api/admin/users/${userId}/status`, {
        method: "PUT",
        body: JSON.stringify({ account_status: newStatus }),
      });
      setAppMessage(res.message || `Account status changed to ${newStatus}`);
      await loadAdminUsers();
    } catch (err) {
      setAppMessage(err.message || "Failed to update user status");
    } finally {
      setIsUpdatingUserRole(false);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to permanently delete user "${userEmail}"?\nThis action will remove their access and all active memberships.`)) {
      return;
    }
    setIsUpdatingUserRole(true);
    try {
      const res = await apiRequest(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      setAppMessage(res.message || `User ${userEmail} deleted successfully`);
      await loadAdminUsers();
      await loadWorkspaceUsers();
    } catch (err) {
      setAppMessage(err.message || "Failed to delete user");
    } finally {
      setIsUpdatingUserRole(false);
    }
  };

  // ----------------------------------------------------
  // 6.2. COMMUNICATION & CHAT ACTIONS
  // ----------------------------------------------------
  const loadConversations = async (autoSelectId = null) => {
    setIsLoadingConversations(true);
    try {
      const data = await apiRequest("/api/conversations");
      const list = data.conversations || [];
      setConversations(list);

      if (autoSelectId) {
        const target = list.find((c) => c.id === autoSelectId);
        if (target) {
          selectConversation(target);
          return;
        }
      }

      if (!selectedConversation && list.length > 0) {
        selectConversation(list[0]);
      } else if (selectedConversation) {
        const updated = list.find((c) => c.id === selectedConversation.id);
        if (updated) setSelectedConversation(updated);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const selectConversation = async (conv) => {
    setSelectedConversation(conv);
    setMobileChatTab("chat");
    setIsLoadingChatMessages(true);
    lastMsgIdRef.current = null;
    try {
      const data = await apiRequest(`/api/conversations/${conv.id}/messages`);
      setChatMessages(data.messages || []);
      setChatHasMore(Boolean(data.has_more));
      markConversationRead(conv.id);
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setIsLoadingChatMessages(false);
    }
  };


  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!selectedConversation || !newMessageText.trim() || isSendingMessage) return;

    const content = newMessageText.trim();
    setNewMessageText("");
    setIsSendingMessage(true);

    try {
      const res = await apiRequest(`/api/conversations/${selectedConversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      if (res.chat_message) {
        setChatMessages((prev) => [...prev, res.chat_message]);
      }
      loadConversations();
    } catch (err) {
      setAppMessage(err.message || "Failed to send message");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleStartDirectChatWith = async (email) => {
    if (!email || !email.trim()) return;
    setDirectChatError("");
    try {
      const res = await apiRequest("/api/conversations/direct", {
        method: "POST",
        body: JSON.stringify({ target_email: email.trim() }),
      });
      setDirectChatEmail("");
      setDirectChatError("");
      setShowNewDirectModal(false);
      setChatFilterTab("all");
      if (res.created) setAppMessage("📨 Message request sent. You can chat as soon as they accept.");
      setMobileChatTab("chat");
      await loadConversations(res.conversation?.id);
    } catch (err) {
      const msg = err.message || "Could not find registered user with that email";
      setDirectChatError(msg);
      setAppMessage(msg);
    }
  };

  const handleStartDirectChat = async (e) => {
    e?.preventDefault();
    await handleStartDirectChatWith(directChatEmail);
  };

  const loadChatUnread = useCallback(async () => {
    try {
      const data = await apiRequest("/api/conversations/unread-count");
      setChatUnreadTotal(data.unread_count || 0);
    } catch {
      /* silent */
    }
  }, []);

  const markConversationRead = async (convId) => {
    try {
      await apiRequest(`/api/conversations/${convId}/read`, { method: "POST" });
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)));
      loadChatUnread();
      loadNotifications();
    } catch {
      /* silent */
    }
  };

  const refreshConversationsSilently = async () => {
    try {
      const data = await apiRequest("/api/conversations");
      const list = data.conversations || [];
      setConversations(list);
      setSelectedConversation((cur) => (cur ? list.find((c) => c.id === cur.id) || cur : cur));
    } catch {
      /* silent */
    }
  };

  const loadOlderMessages = async () => {
    if (!selectedConversation || chatMessages.length === 0 || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const before = encodeURIComponent(chatMessages[0].created_at);
      const data = await apiRequest(`/api/conversations/${selectedConversation.id}/messages?before=${before}`);
      setChatMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...(data.messages || []).filter((m) => !seen.has(m.id)), ...prev];
      });
      setChatHasMore(Boolean(data.has_more));
    } catch (err) {
      setAppMessage(err.message || "Failed to load older messages");
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleEditMessage = async (msg, content) => {
    const res = await apiRequest(`/api/conversations/${selectedConversation.id}/messages/${msg.id}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    setChatMessages((prev) => prev.map((m) => (m.id === msg.id ? res.chat_message : m)));
  };

  const handleDeleteMessage = async (msg) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    try {
      const res = await apiRequest(`/api/conversations/${selectedConversation.id}/messages/${msg.id}`, { method: "DELETE" });
      setChatMessages((prev) => prev.map((m) => (m.id === msg.id ? res.chat_message : m)));
    } catch (err) {
      setAppMessage(err.message || "Failed to delete message");
    }
  };

  const handleRespondDM = async (action) => {
    if (!selectedConversation) return;
    try {
      const res = await apiRequest(`/api/conversations/${selectedConversation.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setAppMessage(action === "accept" ? "Request accepted — you can chat now!" : "Request declined.");
      setSelectedConversation(res.conversation);
      await refreshConversationsSilently();
      loadChatUnread();
    } catch (err) {
      setAppMessage(err.message || "Could not respond to the request");
    }
  };

  // Track the newest timestamp (created / edited / deleted) and scroll only when a NEW message arrives
  useEffect(() => {
    let max = null;
    for (const m of chatMessages) {
      for (const k of ["created_at", "edited_at", "deleted_at"]) {
        if (m[k] && (!max || m[k] > max)) max = m[k];
      }
    }
    chatLastTs.current = max;

    const lastId = chatMessages[chatMessages.length - 1]?.id ?? null;
    if (lastId !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastId;
      chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Poll for new / edited / deleted messages, and refresh the channel list (unread badges, DM status)
  useEffect(() => {
    if (!showChatModal || !selectedConversation?.id) return;
    const convId = selectedConversation.id;
    let cancelled = false;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const since = chatLastTs.current ? `?since=${encodeURIComponent(chatLastTs.current)}` : "";
        const data = await apiRequest(`/api/conversations/${convId}/messages${since}`);
        if (cancelled || !data.messages?.length) return;
        setChatMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          let changed = false;
          for (const m of data.messages) {
            const old = byId.get(m.id);
            if (!old || old.edited_at !== m.edited_at || old.is_deleted !== m.is_deleted) {
              byId.set(m.id, m);
              changed = true;
            }
          }
          if (!changed) return prev;
          return Array.from(byId.values()).sort((a, b) =>
            a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
          );
        });
        if (data.messages.some((m) => !m.is_self)) markConversationRead(convId);
      } catch {
        /* silent */
      }
    };

    const interval = setInterval(tick, 5000);
    const listInterval = setInterval(() => { if (!document.hidden) refreshConversationsSilently(); }, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(listInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChatModal, selectedConversation?.id]);

  // ----------------------------------------------------
  // 6.3. NOTIFICATION ACTIONS
  // ----------------------------------------------------
  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiRequest("/api/notifications");
      const list = data.notifications || [];
      setNotifications(list);
      setUnreadNotifCount(data.unread_count || 0);

      const newest = list[0];
      if (lastSeenNotifId.current === null) {
        lastSeenNotifId.current = newest?.id ?? "";      // first load: remember, don't toast
      } else if (newest && newest.id !== lastSeenNotifId.current) {
        lastSeenNotifId.current = newest.id;
        if (!newest.is_read) {
          setLatestToast(newest);
          setTimeout(() => setLatestToast(null), 6000);
        }
      }
    } catch (err) {
      console.warn("Notification poll failed:", err.message);
    }
  }, []);

  const handleMarkNotifRead = async (notifId) => {
    try {
      await apiRequest(`/api/notifications/${notifId}/read`, { method: "PUT" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
      setUnreadNotifCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification read:", err);
    }
  };

  const handleMarkAllNotifsRead = async () => {
    try {
      await apiRequest("/api/notifications/read-all", { method: "PUT" });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadNotifCount(0);
    } catch (err) {
      console.error("Failed to mark all read:", err);
    }
  };

  // Open whatever a notification refers to (chat, task or team)
  const openNotification = (n) => {
    if (!n.is_read) handleMarkNotifRead(n.id);
    setShowNotifDropdown(false);

    if (n.related_conversation_id) {
      setShowChatModal(true);
      loadConversations(n.related_conversation_id);
    } else if (n.related_task_id) {
      const t = tasks.find((x) => x.id === n.related_task_id);
      if (!t) {
        setAppMessage("That task is no longer available.");
        return;
      }
      const mine = t.created_by === myUserId || t.owner_user_id === myUserId || t.assigned_user_id === myUserId;
      setActiveTab(mine ? "my" : "teams");
      setSearchQuery("");
      setFilterPriority("");
      setFilterStatus("all");
      setSelectedFilterTeamId("");
      setHighlightTaskId(t.id);
      setTimeout(() => document.getElementById(`task-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
      setTimeout(() => setHighlightTaskId(null), 4000);
    } else if (n.related_team_id) {
      setShowTeamModal(true);
      handleSelectTeam({ id: n.related_team_id });
    }
  };

  useEffect(() => {
    if (!session?.user?.id) {
      lastSeenNotifId.current = null;
      return;
    }
    loadNotifications();
    loadChatUnread();
    const tick = () => {
      if (!document.hidden) {
        loadNotifications();
        loadChatUnread();
      }
    };
    const interval = setInterval(tick, 20000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [session?.user?.id, loadNotifications, loadChatUnread]);

  // ----------------------------------------------------
  // 7. COMPUTED STATS & FILTERED TASKS
  // ----------------------------------------------------
  const myUserId = userProfile?.id;
  const isPrivilegedUser = userProfile?.system_role === "ARCHITECT" || userProfile?.system_role === "ADMIN";

  const selectedTaskTeam = teams.find((t) => t.id === taskTeamId);
  const availableAssignees = selectedTaskTeam
    ? (selectedTaskTeam.members || []).filter((m) => m.id !== myUserId)
    : isPrivilegedUser
    ? workspaceUsers.filter((u) => u.id !== myUserId)
    : [];

  const handleTaskTeamChange = (newTeamId) => {
    setTaskTeamId(newTeamId);
    setTaskAssigneeId("");
  };

  const myTasksCount = tasks.filter(
    (t) => t.created_by === myUserId || t.owner_user_id === myUserId || t.assigned_user_id === myUserId
  ).length;

  const teamTasksCount = tasks.filter((t) => Boolean(t.assigned_team_id)).length;
  const totalCount = tasks.length;
  const activeCount = tasks.filter((t) => t.status !== "COMPLETED").length;
  const doneCount = tasks.filter((t) => t.status === "COMPLETED").length;

  const selectedOverviewUser =
    workspaceUsers.find((u) => u.id === selectedUserOverviewId) ||
    workspaceUsers[0] ||
    null;

  const selectedUserTasks = selectedOverviewUser
    ? tasks.filter(
        (t) =>
          t.assigned_user_id === selectedOverviewUser.id ||
          t.owner_user_id === selectedOverviewUser.id ||
          t.created_by === selectedOverviewUser.id
      )
    : [];

  const filteredUserTasks = selectedUserTasks.filter((t) => {
    if (userOverviewStatusFilter === "pending" && t.status === "COMPLETED") return false;
    if (userOverviewStatusFilter === "completed" && t.status !== "COMPLETED") return false;
    return true;
  });

  const filteredTasks = tasks.filter((t) => {
    // 1. Tab filter
    if (activeTab === "my") {
      const isMine = t.created_by === myUserId || t.owner_user_id === myUserId || t.assigned_user_id === myUserId;
      if (!isMine) return false;
    } else if (activeTab === "teams") {
      if (!t.assigned_team_id) return false;
      if (selectedFilterTeamId && t.assigned_team_id !== selectedFilterTeamId) return false;
    } else if (activeTab === "org") {
      if (selectedFilterTeamId) {
        if (selectedFilterTeamId === "personal" && t.assigned_team_id) return false;
        if (selectedFilterTeamId !== "personal" && t.assigned_team_id !== selectedFilterTeamId) return false;
      }
    }

    // 2. Priority filter
    if (filterPriority && t.priority !== filterPriority) return false;

    // 3. Status filter
    if (filterStatus === "completed" && t.status !== "COMPLETED") return false;
    if (filterStatus === "pending" && t.status === "COMPLETED") return false;

    // 4. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchTeam = t.assigned_team_name?.toLowerCase().includes(q);
      const matchOwner = (t.owner_name || t.owner_email)?.toLowerCase().includes(q);
      const matchCreator = (t.created_by_name || t.created_by_email)?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchTeam && !matchOwner && !matchCreator) return false;
    }

    return true;
  });

  const pendingFilteredTasks = filteredTasks.filter((t) => t.status !== "COMPLETED");
  const completedFilteredTasks = filteredTasks.filter((t) => t.status === "COMPLETED");

  const renderTaskCard = (t) => {
    const isCompleted = t.status === "COMPLETED";
    const isUnownedTeamTask = t.assigned_team_id && !t.owner_user_id;
    const myTeamRole = teams.find((tm) => tm.id === t.assigned_team_id)?.my_role;
    const canDelete = isPrivilegedUser || t.created_by === myUserId || myTeamRole === "LEADER";
    const canEdit =
      isPrivilegedUser || t.created_by === myUserId || t.owner_user_id === myUserId ||
      t.assigned_user_id === myUserId || myTeamRole === "LEADER";
    const todayStr = new Date().toLocaleDateString("en-CA");
    const isOverdue = t.due_date && t.due_date < todayStr && t.status !== "COMPLETED" && t.status !== "CANCELLED";

    return (
      <div
        key={t.id}
        id={`task-${t.id}`}
        className={`task-card ${isCompleted ? "task-completed" : ""} ${highlightTaskId === t.id ? "task-highlight" : ""}`}
      >
        <div className="task-check">
          <button
            className={`check-button ${isCompleted ? "checked" : ""}`}
            onClick={() => handleToggleComplete(t)}
            title={isCompleted ? "Mark incomplete" : "Mark complete"}
          >
            {isCompleted ? "✓" : ""}
          </button>
        </div>

        <div className="task-content">
          <h3>{t.title}</h3>
          {t.description && <p>{t.description}</p>}

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "6px" }}>
            <span className={`task-status ${isCompleted ? "done" : "active"}`}>
              {t.status}
            </span>

            <span
              style={{
                fontSize: "10px",
                padding: "3px 7px",
                borderRadius: "999px",
                fontWeight: "750",
                background:
                  t.priority === "HIGH"
                    ? "#fee2e2"
                    : t.priority === "MEDIUM"
                    ? "#fef3c7"
                    : "#ecfdf5",
                color:
                  t.priority === "HIGH"
                    ? "#dc2626"
                    : t.priority === "MEDIUM"
                    ? "#d97706"
                    : "#16a34a",
              }}
            >
              {t.priority}
            </span>

            {t.due_date && (
              <span
                style={{
                  fontSize: "11px", padding: "3px 8px", borderRadius: "999px", fontWeight: 650,
                  background: isOverdue ? "#fee2e2" : "#f1f5f9",
                  color: isOverdue ? "#b91c1c" : "#475569",
                }}
              >
                📅 {t.due_date}{isOverdue && " • overdue"}
              </span>
            )}

            {t.assigned_team_name ? (
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "999px",
                  background: "#e0e7ff",
                  color: "#4338ca",
                  fontWeight: "600",
                }}
              >
                👥 {t.assigned_team_name}
              </span>
            ) : (
              <span
                style={{
                  fontSize: "11px",
                  padding: "3px 8px",
                  borderRadius: "999px",
                  background: "#f1f5f9",
                  color: "#64748b",
                  fontWeight: "500",
                }}
              >
                👤 Personal
              </span>
            )}

            {t.owner_name && (
              <span style={{ fontSize: "11px", color: "#475569" }}>
                Claimed: <strong>{t.owner_name}</strong>
              </span>
            )}

            {(activeTab === "org" || activeTab === "teams") && (t.created_by_email || t.created_by_name) && (
              <span style={{ fontSize: "11px", color: "#64748b" }}>
                Created by: <strong>{t.created_by_email || t.created_by_name}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="task-actions">
          <select className="status-select" value={t.status}
                  onChange={(e) => handleChangeStatus(t, e.target.value)} title="Change status">
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {isUnownedTeamTask && (
            <button
              className="action-button"
              onClick={() => handleClaimTask(t)}
              style={{ borderColor: "#6366f1", color: "#4f46e5" }}
            >
              Claim Task
            </button>
          )}

          {canEdit && (
            <button className="action-button" onClick={() => setEditingTaskItem(t)} title="Edit task">
              ✏️
            </button>
          )}

          {canDelete && (
            <button
              className="action-button"
              onClick={() => handleDeleteTask(t)}
              style={{ color: "#ef4444" }}
              title="Delete task"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // RENDER: INITIAL AUTH RESTORATION LOADER
  // ----------------------------------------------------
  if (isAuthChecking) {
    return (
      <div className="auth-page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div className="brand-icon" style={{ margin: "0 auto 16px" }}>✓</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>TaskFlow V4</div>
          <p style={{ fontSize: "13px", marginTop: "6px" }}>Restoring your session...</p>
        </div>
      </div>
    );
  }

  if (isRecovery && session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-heading">
            <h2>Set a new password</h2>
            <p>Choose a new password for your account.</p>
          </div>
          <form className="auth-form" onSubmit={handleSetNewPassword}>
            <div className="input-group">
              <label>New Password</label>
              <input type="password" value={newPassword} minLength={6} required
                     onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button type="submit" className="primary-button" disabled={authLoading}>
              {authLoading ? "Saving..." : "Update Password"}
            </button>
          </form>
          {authMessage && <div className="message" style={{ marginTop: "16px" }}>{authMessage}</div>}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: AUTH VIEW (WHEN LOGGED OUT)
  // ----------------------------------------------------
  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-section">
            <div className="brand-icon">✓</div>
            <h1>TaskFlow V4</h1>
            <p className="subtitle">Collaborative Task & Team Management</p>

            <div className="connection-status" style={{ flexWrap: "wrap", justifyContent: "center", gap: "6px" }}>
              <span className={`status-dot ${backendStatus === "waking up" ? "retrying" : backendStatus}`}></span>
              <span>Backend: {getStatusLabel()}</span>
              {backendStatus === "offline" && (
                <button
                  type="button"
                  onClick={() => checkHealth(0)}
                  style={{
                    background: "#ef4444",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "3px 10px",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 700,
                    marginLeft: "4px",
                    transition: "all 0.2s",
                  }}
                  title="Ping Render backend to wake it up"
                >
                  ⚡ Wake Up Backend Now
                </button>
              )}
            </div>
            {backendStatus === "waking up" && (
              <div style={{ fontSize: "11px", color: "#f59e0b", margin: "6px 0 0", textAlign: "center", lineHeight: "1.4" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>⚡ Render is waking up the sleeping backend instance...</p>
                <p style={{ margin: "2px 0 0", opacity: 0.85 }}>Cloud containers take ~50-80s to boot from cold sleep.</p>
              </div>
            )}
          </div>

          <div className="auth-heading">
            <h2>{isLoginMode ? "Welcome back" : "Create your account"}</h2>
            <p>
              {isLoginMode
                ? "Enter your credentials to access your tasks."
                : "Sign up with Supabase Auth to collaborate with your teams."}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {!isLoginMode && (
              <div className="input-group">
                <label>Display Name</label>
                <input
                  type="text"
                  placeholder="Alex Doe"
                  value={authDisplayName}
                  onChange={(e) => setAuthDisplayName(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="input-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="alex@example.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {!isLoginMode && (
              <div className="input-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authConfirmPassword}
                  onChange={(e) => setAuthConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={authLoading}
            >
              {authLoading
                ? "Processing..."
                : isLoginMode
                ? "Sign In"
                : "Register with Email Verification"}
            </button>
          </form>

          {isLoginMode && (
            <button type="button" className="switch-button" onClick={handleForgotPassword} disabled={authLoading}>
              Forgot password?
            </button>
          )}

          {showResendVerification && (
            <div style={{ marginTop: "12px", width: "100%" }}>
              <button
                type="button"
                className="secondary-button"
                style={{
                  width: "100%",
                  padding: "10px",
                  fontSize: "0.9rem",
                  borderColor: "rgba(59, 130, 246, 0.4)",
                  background: "rgba(59, 130, 246, 0.08)",
                  color: "#93c5fd",
                }}
                onClick={handleResendVerification}
                disabled={authLoading}
              >
                ✉️ Resend Verification Email
              </button>
            </div>
          )}

          {authMessage && (
            <div className="message" style={{ marginTop: "16px" }}>
              {authMessage}
            </div>
          )}

          <button
            className="switch-button"
            onClick={() => {
              setIsLoginMode(!isLoginMode);
              setAuthMessage("");
            }}
          >
            {isLoginMode
              ? "Need an account? Register here"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: DASHBOARD VIEW (WHEN LOGGED IN)
  // ----------------------------------------------------
  return (
    <div className="dashboard-page">
      <div className="dashboard">
        {/* HEADER */}
        <header className="dashboard-header">
          <div>
            <div className="brand-small">
              <span className="brand-icon small">✓</span>
              TaskFlow V4
            </div>
            <h1>Task Dashboard</h1>
            <p>
              Logged in as <strong>{userProfile?.display_name || userProfile?.email || session.user.email}</strong>
              {" • "}
              <span className="task-status active" style={{ marginLeft: "6px" }}>
                {userProfile?.system_role || "USER"}
              </span>
            </p>
          </div>

          <div className={`header-actions ${menuOpen ? "open" : ""}`}>
            <button className="action-button keep menu-toggle" onClick={() => setMenuOpen((o) => !o)}
                    aria-label="Menu" style={{ minHeight: "40px" }}>☰</button>
            <button className="action-button keep" onClick={toggleTheme} title="Toggle dark / light"
                    style={{ minHeight: "40px", padding: "0 12px" }}>
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <div className="connection-status header-status">
              <span className={`status-dot ${backendStatus === "waking up" ? "retrying" : backendStatus}`}></span>
              <span>{getStatusLabel()}</span>
              {backendStatus === "offline" && (
                <button
                  type="button"
                  onClick={() => checkHealth(0)}
                  style={{
                    background: "#ef4444",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "2px 8px",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 700,
                    marginLeft: "6px",
                  }}
                  title="Retry connecting to backend"
                >
                  ⚡ Wake Up
                </button>
              )}
            </div>
            {userProfile?.system_role === "ARCHITECT" && (
              <button
                className="action-button"
                onClick={() => {
                  setShowAdminModal(true);
                  loadAdminUsers();
                }}
                style={{
                  minHeight: "40px",
                  padding: "0 14px",
                  fontWeight: "700",
                  background: "#fef3c7",
                  color: "#92400e",
                  border: "1px solid #fde68a",
                }}
              >
                👑 Architect Panel
              </button>
            )}
            {/* NOTIFICATION BELL */}
            <div className="keep" style={{ position: "relative" }}>
              <button
                className="action-button"
                onClick={() => {
                  setShowNotifDropdown(!showNotifDropdown);
                  loadNotifications();
                }}
                style={{
                  minHeight: "40px",
                  padding: "0 12px",
                  fontWeight: "700",
                  position: "relative",
                  background: unreadNotifCount > 0 ? "#fff1f2" : "#f8fafc",
                  color: unreadNotifCount > 0 ? "#e11d48" : "#475569",
                  border: unreadNotifCount > 0 ? "1px solid #fecdd3" : "1px solid #e2e8f0",
                }}
                title="Notifications"
              >
                🔔
                {unreadNotifCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      background: "#e11d48",
                      color: "white",
                      fontSize: "10px",
                      fontWeight: 800,
                      borderRadius: "999px",
                      padding: "2px 6px",
                      lineHeight: 1,
                    }}
                  >
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {/* NOTIFICATION DROPDOWN */}
              {showNotifDropdown && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "48px",
                    width: "360px",
                    background: "white",
                    borderRadius: "16px",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
                    border: "1px solid #e2e8f0",
                    zIndex: 1000,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#f8fafc",
                    }}
                  >
                    <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                      Notifications ({unreadNotifCount} unread)
                    </strong>
                    {unreadNotifCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllNotifsRead}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#4f46e5",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: "360px", overflowY: "auto", padding: "8px" }}>
                    {notifications.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "30px 10px", color: "#94a3b8", fontSize: "13px" }}>
                        <div style={{ fontSize: "24px", marginBottom: "6px" }}>🔕</div>
                        No notifications yet.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => openNotification(n)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "10px",
                            marginBottom: "4px",
                            cursor: "pointer",
                            background: n.is_read ? "transparent" : "#f0fdf4",
                            border: n.is_read ? "1px solid transparent" : "1px solid #bbf7d0",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <strong style={{ fontSize: "13px", color: "#1e293b" }}>
                              {n.event_type === "MESSAGE" ? "💬 " : n.event_type === "DM_REQUEST" || n.event_type === "DM_ACCEPTED" ? "🤝 " : n.event_type === "TEAM_INVITE" ? "👥 " : "📋 "}
                              {n.title}
                            </strong>
                            {!n.is_read && (
                              <span
                                style={{
                                  width: "8px",
                                  height: "8px",
                                  borderRadius: "50%",
                                  background: "#16a34a",
                                  marginTop: "4px",
                                }}
                              />
                            )}
                          </div>
                          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b", lineHeight: 1.4 }}>
                            {n.message}
                          </p>
                          <span style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px", display: "inline-block" }}>
                            {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              className="action-button"
              onClick={() => {
                setShowChatModal(true);
                loadConversations();
              }}
              style={{
                minHeight: "40px",
                padding: "0 14px",
                fontWeight: "700",
                background: "#eef2ff",
                color: "#4338ca",
                border: "1px solid #c7d2fe",
              }}
            >
              💬 Team & Direct Chat
              {chatUnreadTotal > 0 && (
                <span style={{ marginLeft: "8px", background: "#e11d48", color: "white", fontSize: "11px",
                               fontWeight: 800, borderRadius: "999px", padding: "2px 8px" }}>
                  {chatUnreadTotal}
                </span>
              )}
            </button>
            <button
              className="action-button"
              onClick={() => {
                setSelectedTeamDetail(null);
                setShowTeamModal(true);
              }}
              style={{ minHeight: "40px", padding: "0 14px", fontWeight: "700" }}
            >
              👥 Teams ({teams.length})
            </button>
            <button
              className="action-button"
              onClick={() => setShowProfileModal(true)}
              style={{ minHeight: "40px", padding: "0 14px", fontWeight: "700" }}
            >
              👤 Profile
            </button>
            <button className="logout-button" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </header>

        {/* LIVE IN-APP TOAST NOTIFICATION POPUP */}
        {latestToast && (
          <div
            onClick={() => {
              openNotification(latestToast);
              setLatestToast(null);
            }}
            style={{
              position: "fixed",
              top: "24px",
              right: "24px",
              background: "#1e1b4b",
              color: "white",
              padding: "14px 20px",
              borderRadius: "14px",
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
              zIndex: 9999,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              maxWidth: "380px",
              border: "1px solid #4338ca",
            }}
          >
            <span style={{ fontSize: "24px" }}>
              {latestToast.event_type === "MESSAGE" ? "💬" : latestToast.event_type === "DM_REQUEST" || latestToast.event_type === "DM_ACCEPTED" ? "🤝" : latestToast.event_type === "TEAM_INVITE" ? "👥" : "🔔"}
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: "14px", display: "block" }}>{latestToast.title}</strong>
              <span style={{ fontSize: "12px", color: "#c7d2fe" }}>{latestToast.message}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLatestToast(null);
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "#a5b4fc",
                fontSize: "18px",
                cursor: "pointer",
                padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>
        )}
        {appMessage && (
          <div
            className="message"
            style={{
              marginBottom: "20px",
              background: "#eef2ff",
              color: "#3730a3",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{appMessage}</span>
            <button
              onClick={() => setAppMessage("")}
              style={{ border: 0, background: "transparent", cursor: "pointer", fontWeight: "bold" }}
            >
              ×
            </button>
          </div>
        )}

        {/* METRIC / STAT CARDS */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total">📋</div>
            <div>
              <span>Total Tasks</span>
              <strong>{totalCount}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon active">⏳</div>
            <div>
              <span>In Progress / Pending</span>
              <strong>{activeCount}</strong>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon done">✓</div>
            <div>
              <span>Completed</span>
              <strong>{doneCount}</strong>
            </div>
          </div>
        </div>

        {/* CREATE TASK FORM */}
        <div className="task-form-card">
          <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2>{isBulkMode ? "Bulk Add Tasks (Up to 10)" : "Create New Task"}</h2>
              <p>
                {isBulkMode
                  ? "Enter one task title per line. Max 10 tasks allowed per request."
                  : "Add personal items or allocate tasks directly to your teams."}
              </p>
            </div>
            <button
              className="action-button"
              onClick={() => setIsBulkMode(!isBulkMode)}
              style={{ fontSize: "12px" }}
            >
              {isBulkMode ? "Switch to Single Mode" : "⚡ Switch to Bulk Mode"}
            </button>
          </div>

          <form onSubmit={handleCreateTask}>
            {isBulkMode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="input-group">
                  <label>Task Titles (1 per line, max 10)</label>
                  <textarea
                    rows={4}
                    placeholder="Prepare presentation&#10;Update AWS EC2 instance&#10;Run security review"
                    value={bulkLines}
                    onChange={(e) => setBulkLines(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label>Priority</label>
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value)}
                      style={{ height: "48px", borderRadius: "11px", border: "1px solid #d9dee8", padding: "0 12px" }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label>Team Scope</label>
                    <select
                      value={taskTeamId}
                      onChange={(e) => handleTaskTeamChange(e.target.value)}
                      style={{ height: "48px", borderRadius: "11px", border: "1px solid #d9dee8", padding: "0 10px" }}
                    >
                      <option value="">Personal / No Team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          Team: #{t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label>Assign to User (Sends Email)</label>
                    <select
                      value={taskAssigneeId}
                      onChange={(e) => setTaskAssigneeId(e.target.value)}
                      disabled={!taskTeamId && !isPrivilegedUser}
                      style={{
                        height: "48px",
                        borderRadius: "11px",
                        border: "1px solid #d9dee8",
                        padding: "0 10px",
                        opacity: (!taskTeamId && !isPrivilegedUser) ? 0.7 : 1,
                        cursor: (!taskTeamId && !isPrivilegedUser) ? "not-allowed" : "default"
                      }}
                    >
                      <option value="">
                        {taskTeamId ? "Unassigned (Team can claim)" : "Myself (Personal)"}
                      </option>
                      {availableAssignees.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name ? `${u.display_name} (${u.email})` : u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="primary-button add-button"
                    disabled={isCreatingTask}
                    style={{ alignSelf: "flex-end", height: "48px" }}
                  >
                    {isCreatingTask ? "Creating..." : "Add All Tasks"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="task-form">
                <div className="input-group">
                  <label>Title</label>
                  <input
                    type="text"
                    placeholder="What needs to be done?"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Description</label>
                  <input
                    type="text"
                    placeholder="Additional context or links..."
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <div className="input-group" style={{ width: "150px" }}>
                    <label>Due date</label>
                    <input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)}
                           style={{ minHeight: "48px" }} />
                  </div>
                  <div className="input-group" style={{ width: "105px" }}>
                    <label>Priority</label>
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value)}
                      style={{ height: "48px", borderRadius: "11px", border: "1px solid #d9dee8", padding: "0 8px" }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                  <div className="input-group" style={{ minWidth: "150px", flex: 1 }}>
                    <label>Team Scope</label>
                    <select
                      value={taskTeamId}
                      onChange={(e) => handleTaskTeamChange(e.target.value)}
                      style={{ height: "48px", borderRadius: "11px", border: "1px solid #d9dee8", padding: "0 8px" }}
                    >
                      <option value="">Personal (No Team)</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          #{t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="input-group" style={{ minWidth: "180px", flex: 1 }}>
                    <label>Assign to User (Sends Email)</label>
                    <select
                      value={taskAssigneeId}
                      onChange={(e) => setTaskAssigneeId(e.target.value)}
                      disabled={!taskTeamId && !isPrivilegedUser}
                      style={{
                        height: "48px",
                        borderRadius: "11px",
                        border: "1px solid #d9dee8",
                        padding: "0 8px",
                        opacity: (!taskTeamId && !isPrivilegedUser) ? 0.7 : 1,
                        cursor: (!taskTeamId && !isPrivilegedUser) ? "not-allowed" : "default"
                      }}
                    >
                      <option value="">
                        {taskTeamId ? "Unassigned (Team can claim)" : "Myself (Personal)"}
                      </option>
                      {availableAssignees.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.display_name ? `${u.display_name} (${u.email})` : u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="primary-button add-button"
                    disabled={isCreatingTask}
                  >
                    {isCreatingTask ? "Adding..." : "+ Add"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* TASK LIST & FILTERS */}
        <div className="task-list">
          {/* VIEW TABS */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: "12px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("my");
                  setSelectedFilterTeamId("");
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "13px",
                  background: activeTab === "my" ? "#4f46e5" : "#f1f5f9",
                  color: activeTab === "my" ? "white" : "#475569",
                  transition: "all 0.15s ease",
                }}
              >
                📌 My Tasks ({myTasksCount})
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab("teams");
                  setSelectedFilterTeamId("");
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "13px",
                  background: activeTab === "teams" ? "#4f46e5" : "#f1f5f9",
                  color: activeTab === "teams" ? "white" : "#475569",
                  transition: "all 0.15s ease",
                }}
              >
                👥 Team Tasks ({teamTasksCount})
              </button>

              {isPrivilegedUser && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("org");
                    setSelectedFilterTeamId("");
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "13px",
                    background: activeTab === "org" ? "#92400e" : "#fef3c7",
                    color: activeTab === "org" ? "white" : "#92400e",
                    transition: "all 0.15s ease",
                  }}
                >
                  🌐 Org Overview ({totalCount})
                </button>
              )}

              {isPrivilegedUser && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("users");
                    setSelectedFilterTeamId("");
                    if (!selectedUserOverviewId && workspaceUsers.length > 0) {
                      setSelectedUserOverviewId(workspaceUsers[0].id);
                    }
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: "13px",
                    background: activeTab === "users" ? "#0f766e" : "#ccfbf1",
                    color: activeTab === "users" ? "white" : "#0f766e",
                    transition: "all 0.15s ease",
                  }}
                >
                  👥 Member Tasks ({workspaceUsers.length})
                </button>
              )}
            </div>

            <span className="task-count" style={{ fontSize: "13px" }}>
              {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
            </span>
          </div>

          {activeTab === "users" && isPrivilegedUser ? (
            /* ADMIN USER DIRECTORY & WORKLOAD OVERSIGHT VIEW */
            <div className="workload-container" style={{ display: "flex", gap: "20px", marginTop: "16px", flexWrap: "wrap", alignItems: "flex-start" }}>
              {/* LEFT COLUMN: USER ROSTER */}
              <div style={{ flex: "1 1 290px", maxWidth: "340px", background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "14px", padding: "16px", boxSizing: "border-box" }}>
                <div style={{ marginBottom: "12px" }}>
                  <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 700, color: "var(--text-primary, #1e293b)" }}>Organization Members</h3>
                  <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#64748b" }}>Select a member to view all their tasks</p>
                  <input
                    type="text"
                    placeholder="🔍 Filter members..."
                    value={userOverviewSearch}
                    onChange={(e) => setUserOverviewSearch(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #d9dee7)", fontSize: "13px", boxSizing: "border-box", background: "var(--input-bg, #ffffff)", color: "var(--text-primary, #0f172a)" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "580px", overflowY: "auto" }}>
                  {workspaceUsers
                    .filter((u) => {
                      if (!userOverviewSearch.trim()) return true;
                      const q = userOverviewSearch.toLowerCase();
                      return (u.email || "").toLowerCase().includes(q) || (u.display_name || "").toLowerCase().includes(q);
                    })
                    .map((u) => {
                      const isSelected = (selectedOverviewUser?.id === u.id);
                      const userPendingCount = tasks.filter(t => (t.assigned_user_id === u.id || t.owner_user_id === u.id) && t.status !== "COMPLETED").length;
                      return (
                        <div
                          key={u.id}
                          onClick={() => setSelectedUserOverviewId(u.id)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "10px",
                            cursor: "pointer",
                            background: isSelected ? "rgba(15, 118, 110, 0.12)" : "transparent",
                            border: isSelected ? "1.5px solid #0f766e" : "1px solid transparent",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1, paddingRight: "8px" }}>
                            <div style={{ fontWeight: 650, fontSize: "13px", color: isSelected ? "#0f766e" : "var(--text-primary, #1e293b)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                              {u.display_name || u.email.split("@")[0]}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{u.email}</div>
                            <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
                              <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "4px", fontWeight: 700, background: u.system_role === "ARCHITECT" ? "#fef3c7" : u.system_role === "ADMIN" ? "#ede9fe" : "#f1f5f9", color: u.system_role === "ARCHITECT" ? "#92400e" : u.system_role === "ADMIN" ? "#5b21b6" : "#475569" }}>
                                {u.system_role}
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: userPendingCount > 0 ? "#fee2e2" : "#f1f5f9", color: userPendingCount > 0 ? "#b91c1c" : "#64748b", whiteSpace: "nowrap" }} title="Active / Pending tasks">
                              {userPendingCount} active
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* RIGHT COLUMN: SELECTED USER WORKLOAD DETAILS */}
              <div style={{ flex: "2 1 450px", background: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e2e8f0)", borderRadius: "14px", padding: "20px", boxSizing: "border-box" }}>
                {selectedOverviewUser ? (
                  <div>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", borderBottom: "1px solid var(--border-color, #f1f5f9)", paddingBottom: "16px", marginBottom: "16px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h2 style={{ margin: 0, fontSize: "18px", color: "var(--text-primary, #0f172a)" }}>
                            {selectedOverviewUser.display_name || selectedOverviewUser.email}
                          </h2>
                          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "999px", fontWeight: 700, background: "#e0f2fe", color: "#0369a1" }}>
                            {selectedOverviewUser.system_role}
                          </span>
                        </div>
                        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                          {selectedOverviewUser.email}
                        </p>
                      </div>
                      <button
                        className="action-button"
                        onClick={() => handleStartDirectChatWith(selectedOverviewUser.email)}
                        style={{ fontSize: "12px", padding: "6px 12px", background: "#eef2ff", color: "#4338ca", borderColor: "#c7d2fe" }}
                      >
                        💬 Message {selectedOverviewUser.display_name?.split(" ")[0] || "User"}
                      </button>
                    </div>

                    {/* User Task Stat Cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "10px", marginBottom: "20px" }}>
                      <div style={{ padding: "10px 14px", background: "var(--bg-secondary, #f8fafc)", borderRadius: "10px", border: "1px solid var(--border-color, #e2e8f0)" }}>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>Total Tasks</div>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary, #1e293b)" }}>{selectedUserTasks.length}</div>
                      </div>
                      <div style={{ padding: "10px 14px", background: "#fffbeb", borderRadius: "10px", border: "1px solid #fef3c7" }}>
                        <div style={{ fontSize: "11px", color: "#b45309" }}>Pending / Active</div>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#b45309" }}>
                          {selectedUserTasks.filter(t => t.status !== "COMPLETED").length}
                        </div>
                      </div>
                      <div style={{ padding: "10px 14px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
                        <div style={{ fontSize: "11px", color: "#15803d" }}>Completed</div>
                        <div style={{ fontSize: "18px", fontWeight: 800, color: "#15803d" }}>
                          {selectedUserTasks.filter(t => t.status === "COMPLETED").length}
                        </div>
                      </div>
                    </div>

                    {/* Sub-filters for user tasks */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {["all", "pending", "completed"].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setUserOverviewStatusFilter(st)}
                            style={{
                              padding: "5px 12px",
                              borderRadius: "6px",
                              border: "none",
                              fontSize: "12px",
                              fontWeight: 650,
                              cursor: "pointer",
                              background: userOverviewStatusFilter === st ? "#0f766e" : "var(--bg-secondary, #f1f5f9)",
                              color: userOverviewStatusFilter === st ? "white" : "var(--text-primary, #475569)",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {st === "all" ? "All Tasks" : st === "pending" ? "Pending / Active" : "Completed"}
                          </button>
                        ))}
                      </div>
                      <span style={{ fontSize: "12px", color: "#64748b" }}>
                        Showing {filteredUserTasks.length} task{filteredUserTasks.length !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Task List */}
                    {filteredUserTasks.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                        <div style={{ fontSize: "28px", marginBottom: "8px" }}>📭</div>
                        No tasks found for this member in this status.
                      </div>
                    ) : (
                      <div className="task-items" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {filteredUserTasks.map((t) => renderTaskCard(t))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "50px", color: "#94a3b8" }}>
                    Select a member on the left to view their workload.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* SEARCH & FILTERS TOOLBAR */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px" }}>
            {/* Search Input */}
            <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
              <input
                type="text"
                placeholder="🔍 Search tasks, descriptions, or teammates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 14px",
                  borderRadius: "10px",
                  border: "1px solid #d9dee7",
                  fontSize: "13px",
                  boxSizing: "border-box",
                  background: "#f8fafc",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "#94a3b8",
                    fontWeight: "bold",
                    fontSize: "14px",
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Team Filter Dropdown (shown in teams or org tab) */}
            {(activeTab === "teams" || activeTab === "org") && (
              <select
                value={selectedFilterTeamId}
                onChange={(e) => setSelectedFilterTeamId(e.target.value)}
                style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid #d9dee7", fontSize: "13px", background: "white" }}
              >
                <option value="">All Teams</option>
                {activeTab === "org" && <option value="personal">Personal Tasks Only</option>}
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}

            {/* Priority Filter */}
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid #d9dee7", fontSize: "13px", background: "white" }}
            >
              <option value="">All Priorities</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: "10px", border: "1px solid #d9dee7", fontSize: "13px", background: "white" }}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Only</option>
              <option value="completed">Completed Only</option>
            </select>
          </div>

          {isLoadingTasks ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#818a9c" }}>
              Loading tasks...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 20px", color: "#818a9c" }}>
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>🏖️</div>
              <strong>No tasks found in this view.</strong>
              <p style={{ margin: "5px 0 0", fontSize: "13px" }}>
                {searchQuery ? "Try adjusting your search or filters." : "Create one above to get started!"}
              </p>
            </div>
          ) : filterStatus !== "all" ? (
            /* Single list if filtered to pending or completed only */
            <div className="task-items">
              {filteredTasks.map((t) => renderTaskCard(t))}
            </div>
          ) : (
            /* Grouped Sections: Pending vs Completed */
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* PENDING SECTION */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "16px" }}>⏳</span>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
                    In Progress & Pending ({pendingFilteredTasks.length})
                  </h3>
                </div>
                {pendingFilteredTasks.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0, padding: "10px 0" }}>
                    🎉 No pending tasks! All caught up.
                  </p>
                ) : (
                  <div className="task-items">
                    {pendingFilteredTasks.map((t) => renderTaskCard(t))}
                  </div>
                )}
              </div>

              {/* COMPLETED SECTION */}
              {completedFilteredTasks.length > 0 && (
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "16px" }}>✓</span>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#64748b" }}>
                      Completed ({completedFilteredTasks.length})
                    </h3>
                  </div>
                  <div className="task-items">
                    {completedFilteredTasks.map((t) => renderTaskCard(t))}
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* TEAMS MANAGEMENT MODAL */}
      {showTeamModal && (
        <div
          onClick={() => setShowTeamModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "28px",
              maxWidth: "580px",
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {/* If selectedTeamDetail is active, show the Team Detail & Member Roster view */}
            {selectedTeamDetail ? (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeamDetail(null);
                      setNewMemberEmail("");
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#4f46e5",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: 0,
                    }}
                  >
                    ← Back to All Teams
                  </button>
                  <button
                    onClick={() => {
                      setShowTeamModal(false);
                      setSelectedTeamDetail(null);
                    }}
                    style={{ border: 0, background: "transparent", fontSize: "22px", cursor: "pointer", color: "#64748b" }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ paddingBottom: "16px", borderBottom: "1px solid #e2e8f0", marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>{selectedTeamDetail.name}</h2>
                    <span className="task-status active" style={{ fontSize: "12px" }}>
                      Your Role: {selectedTeamDetail.my_role || (isPrivilegedUser ? "ADMIN" : "MEMBER")}
                    </span>
                  </div>
                  {selectedTeamDetail.description && (
                    <p style={{ margin: "6px 0 0", fontSize: "14px", color: "#64748b" }}>
                      {selectedTeamDetail.description}
                    </p>
                  )}
                </div>

                {(selectedTeamDetail.my_role === "LEADER" || isPrivilegedUser) && (
                  <div className="team-manage-bar">
                    {!editingTeam ? (
                      <>
                        <button type="button" className="action-button" onClick={() => {
                          setEditTeamName(selectedTeamDetail.name);
                          setEditTeamDesc(selectedTeamDetail.description || "");
                          setEditingTeam(true);
                        }}>✏️ Edit team</button>
                        <button type="button" className="action-button" style={{ color: "#ef4444" }}
                                onClick={handleDeleteTeam}>🗑️ Delete team</button>
                      </>
                    ) : (
                      <form onSubmit={handleSaveTeamEdit}>
                        <input value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)}
                               placeholder="Team name" required maxLength={100} />
                        <textarea rows={2} value={editTeamDesc} onChange={(e) => setEditTeamDesc(e.target.value)}
                                  placeholder="Description (optional)" />
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button type="submit" className="primary-button" style={{ padding: "8px 14px", fontSize: "13px" }}>Save</button>
                          <button type="button" className="action-button" onClick={() => setEditingTeam(false)}>Cancel</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* Team Members Roster */}
                <div style={{ marginBottom: "24px" }}>
                  <h3 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 12px", color: "#334155" }}>
                    Team Members ({selectedTeamDetail.members?.length || 0})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {selectedTeamDetail.members && selectedTeamDetail.members.length > 0 ? (
                      selectedTeamDetail.members.map((m) => (
                        <div
                          key={m.user_id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 14px",
                            borderRadius: "10px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                              {m.display_name || m.email || "Unknown User"}
                            </div>
                            <div style={{ fontSize: "12px", color: "#64748b" }}>
                              {m.email} {m.user_id === userProfile?.id && "(You)"}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "999px",
                                background: m.team_role === "LEADER" ? "#e0e7ff" : "#f1f5f9",
                                color: m.team_role === "LEADER" ? "#4338ca" : "#475569",
                              }}
                            >
                              {m.team_role}
                            </span>
                            {(selectedTeamDetail.my_role === "LEADER" || isPrivilegedUser) && m.user_id !== userProfile?.id && (
                              <button type="button"
                                onClick={() => handleSetMemberRole(m, m.team_role === "LEADER" ? "MEMBER" : "LEADER")}
                                style={{ border: "none", background: "transparent", color: "#4f46e5",
                                         cursor: "pointer", fontSize: "12px", fontWeight: 600, padding: "4px 8px" }}>
                                {m.team_role === "LEADER" ? "Demote" : "Make Leader"}
                              </button>
                            )}

                            {(selectedTeamDetail.my_role === "LEADER" || userProfile?.system_role === "ARCHITECT" || userProfile?.system_role === "ADMIN" || m.user_id === userProfile?.id) && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(m.user_id, m.display_name || m.email)}
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  color: "#ef4444",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  padding: "4px 8px",
                                }}
                              >
                                {m.user_id === userProfile?.id ? "Leave" : "Remove"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: "13px", color: "#94a3b8" }}>No members found.</p>
                    )}
                  </div>
                </div>

                {/* Add Member Form */}
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>
                    + Add Teammate by Email
                  </h4>
                  <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#64748b" }}>
                    User must already have signed up on TaskFlow.
                  </p>
                  <form onSubmit={handleAddMember} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <input
                        type="email"
                        placeholder="teammate@example.com"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        required
                        style={{
                          flex: 1,
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "14px",
                        }}
                      />
                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          fontSize: "14px",
                          background: "white",
                        }}
                      >
                        <option value="MEMBER">Member</option>
                        <option value="LEADER">Leader</option>
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={isAddingMember}
                      style={{ padding: "10px 16px", fontSize: "14px" }}
                    >
                      {isAddingMember ? "Adding..." : "+ Add Teammate"}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              /* All Teams List & Create Team Form */
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h2 style={{ margin: 0, fontSize: "20px" }}>Your Teams</h2>
                  <button
                    onClick={() => {
                      setShowTeamModal(false);
                      setSelectedTeamDetail(null);
                    }}
                    style={{ border: 0, background: "transparent", fontSize: "22px", cursor: "pointer", color: "#64748b" }}
                  >
                    ×
                  </button>
                </div>

                {/* List existing teams */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                    {teams.length === 0 ? (
                      <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>No teams yet. Create your first team below!</p>
                    ) : (
                      teams.map((t) => (
                        <div
                          key={t.id}
                          style={{
                            padding: "12px 16px",
                            borderRadius: "12px",
                            border: "1px solid #e2e8f0",
                            background: "#f8fafc",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <strong style={{ fontSize: "15px", color: "#0f172a" }}>{t.name}</strong>
                            {t.description && <div style={{ fontSize: "13px", color: "#64748b" }}>{t.description}</div>}
                            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                              {t.member_count || 1} {t.member_count === 1 ? "member" : "members"} • Role: {t.my_role || (isPrivilegedUser ? "ADMIN VIEW" : "MEMBER")}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => handleSelectTeam(t)}
                            disabled={isLoadingTeamDetail}
                            style={{
                              padding: "6px 12px",
                              fontSize: "13px",
                              fontWeight: 600,
                              borderRadius: "8px",
                              border: "1px solid #cbd5e1",
                              background: "white",
                              cursor: "pointer",
                            }}
                          >
                            Manage Members →
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Create team form */}
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
                  <form onSubmit={handleCreateTeam} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <strong style={{ fontSize: "14px", color: "#334155" }}>Create a New Team:</strong>
                    <input
                      type="text"
                      placeholder="Team Name (e.g. Backend Platform)"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      required
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                    />
                    <input
                      type="text"
                      placeholder="Team Description (optional)"
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}
                    />
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={isCreatingTeam}
                      style={{ marginTop: "6px" }}
                    >
                      {isCreatingTeam ? "Creating..." : "+ Create Team"}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ARCHITECT ADMIN PANEL MODAL */}
      {showAdminModal && userProfile?.system_role === "ARCHITECT" && (
        <div
          onClick={() => setShowAdminModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "20px",
              padding: "28px",
              maxWidth: "640px",
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>👑 System Users & Roles</h2>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                  Only visible to Architect. Promote users to Admin or manage system roles.
                </p>
              </div>
              <button
                onClick={() => setShowAdminModal(false)}
                style={{ border: 0, background: "transparent", fontSize: "22px", cursor: "pointer", color: "#64748b" }}
              >
                ×
              </button>
            </div>

            {isLoadingAdminUsers ? (
              <p style={{ color: "#64748b", fontSize: "14px" }}>Loading registered users...</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                {adminUsers.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: "13px" }}>No users registered yet.</p>
                ) : (
                  adminUsers.map((u) => {
                    const isSelf = u.id === userProfile?.id;
                    return (
                      <div
                        key={u.id}
                        style={{
                          padding: "12px 16px",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          background: isSelf ? "#fdfbf7" : "#f8fafc",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                            {u.display_name || u.email} {isSelf && "(You - Architect)"}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>{u.email}</div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "3px 8px",
                              borderRadius: "999px",
                              background:
                                u.account_status === "ACTIVE" ? "#dcfce7" : "#fee2e2",
                              color:
                                u.account_status === "ACTIVE" ? "#15803d" : "#b91c1c",
                            }}
                          >
                            {u.account_status || "ACTIVE"}
                          </span>

                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "4px 9px",
                              borderRadius: "999px",
                              background:
                                u.system_role === "ARCHITECT"
                                  ? "#fef3c7"
                                  : u.system_role === "ADMIN"
                                  ? "#dbeafe"
                                  : "#f1f5f9",
                              color:
                                u.system_role === "ARCHITECT"
                                  ? "#92400e"
                                  : u.system_role === "ADMIN"
                                  ? "#1e40af"
                                  : "#475569",
                            }}
                          >
                            {u.system_role}
                          </span>

                          {!isSelf && u.system_role !== "ARCHITECT" && (
                            <>
                              <select
                                value={u.system_role}
                                disabled={isUpdatingUserRole}
                                onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "8px",
                                  border: "1px solid #cbd5e1",
                                  fontSize: "12px",
                                  background: "white",
                                  cursor: "pointer",
                                  fontWeight: 500,
                                }}
                              >
                                <option value="USER">USER</option>
                                <option value="ADMIN">ADMIN</option>
                              </select>

                              <button
                                type="button"
                                disabled={isUpdatingUserRole}
                                onClick={() => handleToggleUserStatus(u.id, u.account_status)}
                                style={{
                                  padding: "5px 9px",
                                  borderRadius: "8px",
                                  border: "1px solid #cbd5e1",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  background: "#f8fafc",
                                  color: "#334155",
                                  cursor: "pointer",
                                }}
                                title={u.account_status === "ACTIVE" ? "Suspend user" : "Activate user"}
                              >
                                {u.account_status === "ACTIVE" ? "Suspend" : "Activate"}
                              </button>

                              <button
                                type="button"
                                disabled={isUpdatingUserRole}
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                style={{
                                  padding: "5px 10px",
                                  borderRadius: "8px",
                                  border: "1px solid #fca5a5",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  background: "#fee2e2",
                                  color: "#dc2626",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                                title="Permanently delete user"
                              >
                                🗑️ Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHAT & COMMUNICATION MODAL */}
      {showChatModal && (
        <div
          onClick={() => setShowChatModal(false)}
          className="chat-modal-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="chat-modal-window"
          >
            {/* LEFT SIDEBAR: CHANNELS & CONVERSATIONS */}
            <div
              className={`chat-sidebar ${mobileChatTab === "channels" ? "mobile-visible" : "mobile-hidden"}`}
            >
              {/* Sidebar Header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>💬 Channels & Chats</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setShowNewDirectModal(true)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: "8px",
                        background: "#e0e7ff",
                        color: "#4338ca",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      title="Start 1-on-1 direct message"
                    >
                      + Direct
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowChatModal(false)}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#f1f5f9",
                        fontSize: "18px",
                        cursor: "pointer",
                        color: "#334155",
                        width: "30px",
                        height: "30px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                      title="Close chat modal"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div style={{ display: "flex", gap: "6px" }}>
                  {["all", "team", "direct"].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setChatFilterTab(tab)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: "none",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        background: chatFilterTab === tab ? "#4f46e5" : "#e2e8f0",
                        color: chatFilterTab === tab ? "white" : "#475569",
                        textTransform: "capitalize",
                      }}
                    >
                      {tab === "all" ? "All" : tab === "team" ? "# Teams" : "✉️ Direct"}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: "8px 20px", fontSize: "11px", color: "#64748b", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
                🔒 Direct chats need the other person's approval and are private to the two participants. The workspace
                Architect can view all conversations for supervision; Admins can view team channels.
              </div>

              {/* Conversations List */}
              <div style={{ flex: 1, overflowY: "auto", padding: "10px" }}>
                {isLoadingConversations ? (
                  <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "13px", padding: "20px 0" }}>
                    Loading channels...
                  </p>
                ) : (
                  conversations
                    .filter((c) => {
                      if (chatFilterTab === "team") return c.conversation_type === "TEAM";
                      if (chatFilterTab === "direct") return c.conversation_type === "DIRECT";
                      return true;
                    })
                    .map((conv) => {
                      const isSelected = selectedConversation?.id === conv.id;
                      const isTeam = conv.conversation_type === "TEAM";

                      return (
                        <div
                          key={conv.id}
                          onClick={() => selectConversation(conv)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "10px",
                            cursor: "pointer",
                            marginBottom: "6px",
                            background: isSelected ? "#eef2ff" : "transparent",
                            border: isSelected ? "1px solid #c7d2fe" : "1px solid transparent",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <strong style={{ fontSize: "13px", color: isSelected ? "#4338ca" : "#1e293b" }}>
                              {isTeam ? "👥 " : "✉️ "}
                              {conv.title}
                              {conv.unread_count > 0 && (
                                <span style={{ marginLeft: "6px", background: "#e11d48", color: "white", fontSize: "10px",
                                               fontWeight: 800, borderRadius: "999px", padding: "2px 7px" }}>
                                  {conv.unread_count}
                                </span>
                              )}
                              {!isTeam && conv.dm_status === "PENDING" && (
                                <span style={{ marginLeft: "6px", background: "#fef3c7", color: "#92400e", fontSize: "10px",
                                               fontWeight: 700, borderRadius: "999px", padding: "2px 7px" }}>
                                  {conv.is_incoming_request ? "Request" : "Pending"}
                                </span>
                              )}
                              {!isTeam && conv.dm_status === "DECLINED" && (
                                <span style={{ marginLeft: "6px", background: "#fee2e2", color: "#b91c1c", fontSize: "10px",
                                               fontWeight: 700, borderRadius: "999px", padding: "2px 7px" }}>
                                  Declined
                                </span>
                              )}
                            </strong>
                            {isTeam && (
                              <span style={{ fontSize: "10px", color: "#64748b", background: "#e2e8f0", padding: "2px 6px", borderRadius: "999px" }}>
                                Team
                              </span>
                            )}
                          </div>
                          {conv.last_message ? (
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              <strong>{conv.last_message.sender_name}:</strong> {conv.last_message.content}
                            </div>
                          ) : (
                            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
                              {conv.subtitle || "No messages yet"}
                            </div>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* RIGHT MAIN PANEL: ACTIVE CONVERSATION & MESSAGES */}
            <div className={`chat-main-panel ${mobileChatTab === "chat" ? "mobile-visible" : "mobile-hidden"}`}>
              {selectedConversation ? (
                <>
                  {/* Active Header */}
                  <div
                    style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "white",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button
                        type="button"
                        className="mobile-back-to-channels"
                        onClick={() => setMobileChatTab("channels")}
                        title="Back to channels"
                      >
                        ← Channels
                      </button>
                      <div>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                          {selectedConversation.title}
                        </h3>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                          {selectedConversation.subtitle}
                          {userProfile?.system_role === "ARCHITECT" && (
                            <span style={{ marginLeft: "8px", color: "#92400e", fontWeight: 600 }}>
                              • Architect Oversight
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowChatModal(false)}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#f1f5f9",
                        fontSize: "22px",
                        cursor: "pointer",
                        color: "#334155",
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                      title="Close chat modal"
                    >
                      ×
                    </button>
                  </div>

                  {/* Messages Feed */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "20px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      background: "#fafafa",
                    }}
                  >
                    {isLoadingChatMessages ? (
                      <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>Loading messages...</p>
                    ) : (
                      <ChatMessages
                        messages={chatMessages}
                        hasMore={chatHasMore}
                        isLoadingOlder={isLoadingOlder}
                        onLoadOlder={loadOlderMessages}
                        onEdit={handleEditMessage}
                        onDelete={handleDeleteMessage}
                      />
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {selectedConversation.conversation_type === "DIRECT" && selectedConversation.dm_status !== "ACCEPTED" && (
                    <DmStatusBar
                      conversation={selectedConversation}
                      me={userProfile?.id}
                      isArchitect={userProfile?.system_role === "ARCHITECT"}
                      onRespond={handleRespondDM}
                    />
                  )}
                  {/* Message Input Footer */}
                  <form
                    onSubmit={handleSendMessage}
                    style={{
                      padding: "14px 20px",
                      borderTop: "1px solid #e2e8f0",
                      display: selectedConversation.conversation_type === "DIRECT" && selectedConversation.dm_status !== "ACCEPTED" ? "none" : "flex",
                      gap: "10px",
                      background: "white",
                    }}
                  >
                    <input
                      type="text"
                      placeholder={`Message ${selectedConversation.title}...`}
                      value={newMessageText}
                      onChange={(e) => setNewMessageText(e.target.value)}
                      disabled={isSendingMessage}
                      style={{
                        flex: 1,
                        padding: "11px 16px",
                        borderRadius: "10px",
                        border: "1px solid #cbd5e1",
                        fontSize: "14px",
                        outline: "none",
                      }}
                    />
                    <button
                      type="submit"
                      disabled={isSendingMessage || !newMessageText.trim()}
                      className="primary-button"
                      style={{ padding: "0 20px", height: "44px", borderRadius: "10px", fontWeight: 700 }}
                    >
                      {isSendingMessage ? "Sending..." : "Send ➔"}
                    </button>
                  </form>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f8fafc" }}>
                  {/* Top Header with Close Cross Button */}
                  <div
                    style={{
                      padding: "14px 20px",
                      borderBottom: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "white",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button
                        type="button"
                        className="mobile-back-to-channels"
                        onClick={() => setMobileChatTab("channels")}
                        title="Back to channels"
                      >
                        ← Channels
                      </button>
                      <div>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                          💬 TaskFlow Chat & Direct Messaging
                        </h3>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                          Select a channel on the left, or message a colleague below.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowChatModal(false)}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#f1f5f9",
                        fontSize: "22px",
                        cursor: "pointer",
                        color: "#334155",
                        width: "36px",
                        height: "36px",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                      title="Close chat modal"
                    >
                      ×
                    </button>
                  </div>

                  {/* Body with direct email input box and workspace users quick list */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
                    <div style={{ maxWidth: "580px", margin: "0 auto" }}>
                      {/* Direct Message Input Box Card */}
                      <div
                        style={{
                          background: "white",
                          borderRadius: "16px",
                          padding: "24px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                          border: "1px solid #e2e8f0",
                          marginBottom: "24px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                          <span style={{ fontSize: "28px" }}>✉️</span>
                          <div>
                            <h4 style={{ margin: 0, fontSize: "16px", color: "#0f172a", fontWeight: 700 }}>
                              Start Direct Message
                            </h4>
                            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
                              Enter any registered user's email to start a private 1-on-1 chat.
                            </p>
                          </div>
                        </div>

                        {directChatError && (
                          <div
                            style={{
                              background: "#fef2f2",
                              border: "1px solid #fecaca",
                              color: "#dc2626",
                              padding: "10px 14px",
                              borderRadius: "8px",
                              fontSize: "13px",
                              marginBottom: "14px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span>⚠️ {directChatError}</span>
                            <button
                              type="button"
                              onClick={() => setDirectChatError("")}
                              style={{ border: 0, background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: "18px", fontWeight: 700 }}
                            >
                              ×
                            </button>
                          </div>
                        )}

                        <form onSubmit={handleStartDirectChat} style={{ display: "flex", gap: "10px" }}>
                          <input
                            type="email"
                            placeholder="colleague@example.com"
                            value={directChatEmail}
                            onChange={(e) => {
                              setDirectChatEmail(e.target.value);
                              if (directChatError) setDirectChatError("");
                            }}
                            required
                            style={{
                              flex: 1,
                              padding: "11px 16px",
                              borderRadius: "10px",
                              border: "1px solid #cbd5e1",
                              fontSize: "14px",
                              outline: "none",
                            }}
                          />
                          <button
                            type="submit"
                            className="primary-button"
                            style={{ padding: "0 20px", height: "44px", borderRadius: "10px", fontWeight: 700, whiteSpace: "nowrap" }}
                          >
                            Start Chat ➔
                          </button>
                        </form>
                      </div>

                      {/* Workspace Users Quick Selection */}
                      <div
                        style={{
                          background: "white",
                          borderRadius: "16px",
                          padding: "24px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                          border: "1px solid #e2e8f0",
                        }}
                      >
                        <h4 style={{ margin: "0 0 4px", fontSize: "15px", color: "#0f172a", fontWeight: 700 }}>
                          👥 Workspace Colleagues
                        </h4>
                        <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b" }}>
                          Click below to instantly open or start a chat with any teammate.
                        </p>

                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {workspaceUsers.filter((u) => u.id !== userProfile?.id).length === 0 ? (
                            <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "16px" }}>
                              No other registered teammates found in workspace yet. Invite colleagues to sign up!
                            </p>
                          ) : (
                            workspaceUsers
                              .filter((u) => u.id !== userProfile?.id)
                              .map((colleague) => (
                                <div
                                  key={colleague.id}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "12px 16px",
                                    borderRadius: "10px",
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>
                                      {colleague.display_name || colleague.email.split("@")[0]}
                                    </div>
                                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                                      {colleague.email}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleStartDirectChatWith(colleague.email)}
                                    style={{
                                      padding: "6px 14px",
                                      borderRadius: "8px",
                                      background: "#e0e7ff",
                                      color: "#4338ca",
                                      border: "1px solid #c7d2fe",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    💬 Chat
                                  </button>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* START DIRECT CHAT MODAL */}
      {showNewDirectModal && (
        <div
          onClick={() => {
            setShowNewDirectModal(false);
            setDirectChatError("");
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "480px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", color: "#0f172a", fontWeight: 700 }}>✉️ New Direct Message</h3>
              <button
                type="button"
                onClick={() => {
                  setShowNewDirectModal(false);
                  setDirectChatError("");
                }}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#f1f5f9",
                  fontSize: "22px",
                  cursor: "pointer",
                  color: "#334155",
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  lineHeight: 1,
                }}
                title="Close"
              >
                ×
              </button>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "13px", color: "#64748b" }}>
              Enter the registered email of the teammate you want to message privately.
            </p>

            {directChatError && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#dc2626",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  marginBottom: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>⚠️ {directChatError}</span>
                <button
                  type="button"
                  onClick={() => setDirectChatError("")}
                  style={{ border: 0, background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: "18px", fontWeight: 700 }}
                >
                  ×
                </button>
              </div>
            )}

            <form onSubmit={handleStartDirectChat} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input
                type="email"
                placeholder="colleague@example.com"
                value={directChatEmail}
                onChange={(e) => {
                  setDirectChatEmail(e.target.value);
                  if (directChatError) setDirectChatError("");
                }}
                required
                style={{ padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "14px" }}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewDirectModal(false);
                    setDirectChatError("");
                  }}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#475569",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" style={{ flex: 1, padding: "10px" }}>
                  Start Conversation
                </button>
              </div>
            </form>

            {/* Quick-pick Workspace Colleagues */}
            {workspaceUsers.filter((u) => u.id !== userProfile?.id).length > 0 && (
              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
                <h5 style={{ margin: "0 0 10px", fontSize: "13px", color: "#475569", fontWeight: 700 }}>
                  Or Choose from Workspace Colleagues:
                </h5>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "160px", overflowY: "auto" }}>
                  {workspaceUsers
                    .filter((u) => u.id !== userProfile?.id)
                    .map((colleague) => (
                      <div
                        key={colleague.id}
                        onClick={() => handleStartDirectChatWith(colleague.email)}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                      >
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 600, fontSize: "13px", color: "#1e293b" }}>
                            {colleague.display_name || colleague.email.split("@")[0]}
                          </span>
                          <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "6px" }}>
                            ({colleague.email})
                          </span>
                        </div>
                        <span style={{ fontSize: "12px", color: "#4338ca", fontWeight: 700, paddingLeft: "8px" }}>
                          Chat ➔
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {editingTaskItem && (
        <TaskEditModal task={editingTaskItem} onClose={() => setEditingTaskItem(null)} onSave={handleSaveTaskEdit} />
      )}
      {showProfileModal && (
        <ProfileModal
          user={userProfile}
          onClose={() => setShowProfileModal(false)}
          onSaved={(u) => setUserProfile(u)}
          onMessage={setAppMessage}
        />
      )}
    </div>
  );
}
