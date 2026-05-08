using Microsoft.Data.Sqlite;
using Microsoft.AspNetCore.SignalR;
using System.Security.Cryptography;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();

builder.WebHost.UseUrls("http://localhost:5000");

var app = builder.Build();

var dbPath = Path.Combine(AppContext.BaseDirectory, "techservice.db");
Database.Initialize(dbPath);

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapHub<OrdersHub>("/ordersHub");

var sessions = new Dictionary<string, UserSession>();

UserSession? GetSession(HttpContext ctx)
{
    var token = ctx.Request.Headers.Authorization.ToString().Replace("Bearer ", "");
    if (string.IsNullOrWhiteSpace(token)) return null;
    return sessions.TryGetValue(token, out var session) ? session : null;
}

bool IsAdmin(UserSession? session) => session?.Role == "Admin";
bool IsStaff(UserSession? session) => session != null;

app.MapPost("/api/login", async (LoginRequest request) =>
{
    await using var db = Database.Open(dbPath);
    var user = await Database.GetUserByEmail(db, request.Email);

    if (user == null || !PasswordHasher.Verify(request.Password, user.PasswordHash))
        return Results.Unauthorized();

    var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    sessions[token] = new UserSession(user.Id, user.Name, user.Email, user.Role);

    return Results.Ok(new
    {
        token,
        user = new { id = user.Id, name = user.Name, email = user.Email, role = user.Role }
    });
});

app.MapGet("/api/me", (HttpContext ctx) =>
{
    var session = GetSession(ctx);
    return session == null ? Results.Unauthorized() : Results.Ok(session);
});

app.MapGet("/api/statuses", async (HttpContext ctx) =>
{
    if (!IsStaff(GetSession(ctx))) return Results.Unauthorized();

    await using var db = Database.Open(dbPath);
    return Results.Ok(await Database.ListStatuses(db));
});

app.MapPost("/api/statuses", async (HttpContext ctx, StatusRequest request, IHubContext<OrdersHub> hub) =>
{
    var session = GetSession(ctx);
    if (!IsAdmin(session)) return Results.Forbid();

    await using var db = Database.Open(dbPath);
    await Database.Execute(db, "INSERT INTO Statuses(Name) VALUES($name)", ("$name", request.Name));
    await hub.Clients.All.SendAsync("DataChanged", new { type = "status-created" });

    return Results.Ok(new { message = "Status criado com sucesso." });
});

app.MapDelete("/api/statuses/{id:int}", async (HttpContext ctx, int id, IHubContext<OrdersHub> hub) =>
{
    var session = GetSession(ctx);
    if (!IsAdmin(session)) return Results.Forbid();

    await using var db = Database.Open(dbPath);
    await Database.Execute(db, "DELETE FROM Statuses WHERE Id=$id", ("$id", id));
    await hub.Clients.All.SendAsync("DataChanged", new { type = "status-deleted" });

    return Results.Ok(new { message = "Status removido." });
});

app.MapGet("/api/users", async (HttpContext ctx) =>
{
    var session = GetSession(ctx);
    if (!IsStaff(session)) return Results.Unauthorized();

    await using var db = Database.Open(dbPath);
    return Results.Ok(await Database.ListUsers(db));
});

app.MapPost("/api/users", async (HttpContext ctx, CreateUserRequest request, IHubContext<OrdersHub> hub) =>
{
    var session = GetSession(ctx);
    if (!IsAdmin(session)) return Results.Forbid();

    await using var db = Database.Open(dbPath);
    await Database.Execute(db,
        "INSERT INTO Users(Name, Email, PasswordHash, Role, Active) VALUES($name,$email,$pass,$role,1)",
        ("$name", request.Name),
        ("$email", request.Email),
        ("$pass", PasswordHasher.Hash(request.Password)),
        ("$role", request.Role));

    await hub.Clients.All.SendAsync("DataChanged", new { type = "user-created" });

    return Results.Ok(new { message = "Usuário criado com sucesso." });
});

app.MapPut("/api/users/{id:int}", async (HttpContext ctx, int id, UpdateUserRequest request, IHubContext<OrdersHub> hub) =>
{
    var session = GetSession(ctx);
    if (!IsAdmin(session)) return Results.Forbid();

    await using var db = Database.Open(dbPath);

    if (!string.IsNullOrWhiteSpace(request.Password))
    {
        await Database.Execute(db,
            "UPDATE Users SET Name=$name, Email=$email, Role=$role, PasswordHash=$pass, Active=$active WHERE Id=$id",
            ("$name", request.Name),
            ("$email", request.Email),
            ("$role", request.Role),
            ("$pass", PasswordHasher.Hash(request.Password)),
            ("$active", request.Active ? 1 : 0),
            ("$id", id));
    }
    else
    {
        await Database.Execute(db,
            "UPDATE Users SET Name=$name, Email=$email, Role=$role, Active=$active WHERE Id=$id",
            ("$name", request.Name),
            ("$email", request.Email),
            ("$role", request.Role),
            ("$active", request.Active ? 1 : 0),
            ("$id", id));
    }

    await hub.Clients.All.SendAsync("DataChanged", new { type = "user-updated" });
    return Results.Ok(new { message = "Usuário atualizado." });
});


app.MapDelete("/api/users/{id:int}", async (HttpContext ctx, int id, IHubContext<OrdersHub> hub) =>
{
    var session = GetSession(ctx);
    if (!IsAdmin(session)) return Results.Forbid();

    if (session!.Id == id)
        return Results.BadRequest(new { message = "O administrador logado não pode apagar o próprio usuário." });

    await using var db = Database.Open(dbPath);

    await Database.Execute(db, "UPDATE ServiceOrders SET TechnicianId=NULL WHERE TechnicianId=$id", ("$id", id));
    await Database.Execute(db, "DELETE FROM Users WHERE Id=$id", ("$id", id));
    sessions.Where(x => x.Value.Id == id).Select(x => x.Key).ToList().ForEach(key => sessions.Remove(key));

    await hub.Clients.All.SendAsync("DataChanged", new { type = "user-deleted" });
    return Results.Ok(new { message = "Usuário apagado com sucesso." });
});

app.MapGet("/api/orders", async (HttpContext ctx) =>
{
    var session = GetSession(ctx);
    if (!IsStaff(session)) return Results.Unauthorized();

    await using var db = Database.Open(dbPath);
    return Results.Ok(await Database.ListOrders(db));
});

app.MapGet("/api/orders/{id:int}", async (HttpContext ctx, int id) =>
{
    var session = GetSession(ctx);
    if (!IsStaff(session)) return Results.Unauthorized();

    await using var db = Database.Open(dbPath);
    var order = await Database.GetOrder(db, id);
    var logs = await Database.ListLogs(db, id);

    return order == null ? Results.NotFound() : Results.Ok(new { order, logs });
});

app.MapPost("/api/orders", async (HttpContext ctx, CreateOrderRequest request, IHubContext<OrdersHub> hub) =>
{
    var session = GetSession(ctx);
    if (!IsStaff(session)) return Results.Unauthorized();

    if (session.Role != "Balconista" && session.Role != "Admin")
        return Results.Forbid();

    await using var db = Database.Open(dbPath);

    var now = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

    var id = await Database.InsertOrder(db, request, session.Id, now);
    await Database.AddLog(db, id, session.Id, "Cadastro", $"Ordem cadastrada por {session.Name}.", now);

    await hub.Clients.All.SendAsync("OrderChanged", new { type = "created", orderId = id, by = session.Name, at = now });

    return Results.Ok(new { id, message = "Ordem de serviço cadastrada." });
});

app.MapPut("/api/orders/{id:int}", async (HttpContext ctx, int id, UpdateOrderRequest request, IHubContext<OrdersHub> hub) =>
{
    var session = GetSession(ctx);
    if (!IsStaff(session)) return Results.Unauthorized();

    await using var db = Database.Open(dbPath);
    var now = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");

    await Database.UpdateOrder(db, id, request, session);
    await Database.AddLog(db, id, session.Id, "Atualização", $"Ordem atualizada por {session.Name}. Status: {request.Status}.", now);

    await hub.Clients.All.SendAsync("OrderChanged", new { type = "updated", orderId = id, by = session.Name, status = request.Status, at = now });

    return Results.Ok(new { message = "Ordem atualizada." });
});

app.MapGet("/api/reports", async (HttpContext ctx) =>
{
    var session = GetSession(ctx);
    if (!IsStaff(session)) return Results.Unauthorized();

    await using var db = Database.Open(dbPath);
    return Results.Ok(await Database.Reports(db));
});

app.Run();

record LoginRequest(string Email, string Password);
record StatusRequest(string Name);
record CreateUserRequest(string Name, string Email, string Password, string Role);
record UpdateUserRequest(string Name, string Email, string? Password, string Role, bool Active);

record CreateOrderRequest(
    string CustomerName,
    string CustomerContact,
    string Device,
    string ProblemDescription,
    string EntryCondition,
    string EntryDate,
    string? ExpectedExitDate,
    string Status,
    int? TechnicianId,
    string? Notes
);

record UpdateOrderRequest(
    string CustomerName,
    string CustomerContact,
    string Device,
    string ProblemDescription,
    string EntryCondition,
    string EntryDate,
    string? ExpectedExitDate,
    string Status,
    int? TechnicianId,
    string? TechnicalDiagnosis,
    string? ServicePerformed,
    string? Notes
);

record UserSession(int Id, string Name, string Email, string Role);

class OrdersHub : Hub
{
}

class Database
{
    public static SqliteConnection Open(string dbPath)
    {
        var db = new SqliteConnection($"Data Source={dbPath}");
        db.Open();
        return db;
    }

    public static void Initialize(string dbPath)
    {
        using var db = Open(dbPath);

        ExecuteSync(db, "CREATE TABLE IF NOT EXISTS Users(Id INTEGER PRIMARY KEY AUTOINCREMENT,Name TEXT NOT NULL,Email TEXT NOT NULL UNIQUE,PasswordHash TEXT NOT NULL,Role TEXT NOT NULL,Active INTEGER NOT NULL DEFAULT 1);");
        ExecuteSync(db, "CREATE TABLE IF NOT EXISTS Statuses(Id INTEGER PRIMARY KEY AUTOINCREMENT,Name TEXT NOT NULL UNIQUE);");
        ExecuteSync(db, "CREATE TABLE IF NOT EXISTS ServiceOrders(Id INTEGER PRIMARY KEY AUTOINCREMENT,CustomerName TEXT NOT NULL,CustomerContact TEXT NOT NULL,Device TEXT NOT NULL,ProblemDescription TEXT NOT NULL,EntryCondition TEXT NOT NULL,EntryDate TEXT NOT NULL,ExpectedExitDate TEXT,Status TEXT NOT NULL,TechnicianId INTEGER,CreatedById INTEGER NOT NULL,CreatedAt TEXT NOT NULL,UpdatedAt TEXT,TechnicalDiagnosis TEXT,ServicePerformed TEXT,Notes TEXT,CompletedAt TEXT,FOREIGN KEY(TechnicianId) REFERENCES Users(Id),FOREIGN KEY(CreatedById) REFERENCES Users(Id));");
        ExecuteSync(db, "CREATE TABLE IF NOT EXISTS OrderLogs(Id INTEGER PRIMARY KEY AUTOINCREMENT,OrderId INTEGER NOT NULL,UserId INTEGER NOT NULL,Action TEXT NOT NULL,Details TEXT NOT NULL,CreatedAt TEXT NOT NULL,FOREIGN KEY(OrderId) REFERENCES ServiceOrders(Id),FOREIGN KEY(UserId) REFERENCES Users(Id));");

        Seed(db);
    }

    static void Seed(SqliteConnection db)
    {
        var count = Convert.ToInt32(Scalar(db, "SELECT COUNT(*) FROM Users"));
        if (count == 0)
        {
            ExecuteSync(db, "INSERT INTO Users(Name,Email,PasswordHash,Role,Active) VALUES($n,$e,$p,$r,1)", ("$n", "Administrador"), ("$e", "admin@techservice.com"), ("$p", PasswordHasher.Hash("admin123")), ("$r", "Admin"));
            ExecuteSync(db, "INSERT INTO Users(Name,Email,PasswordHash,Role,Active) VALUES($n,$e,$p,$r,1)", ("$n", "Balconista Demo"), ("$e", "balc@techservice.com"), ("$p", PasswordHasher.Hash("balc123")), ("$r", "Balconista"));
            ExecuteSync(db, "INSERT INTO Users(Name,Email,PasswordHash,Role,Active) VALUES($n,$e,$p,$r,1)", ("$n", "Técnico Demo"), ("$e", "tecnico@techservice.com"), ("$p", PasswordHasher.Hash("tecnico123")), ("$r", "Tecnico"));
        }

        var statusCount = Convert.ToInt32(Scalar(db, "SELECT COUNT(*) FROM Statuses"));
        if (statusCount == 0)
        {
            foreach (var s in new[] { "Em andamento", "Concluído", "Não feito", "Aguardando peça", "Entrar em contato", "Cancelado", "Entregue" })
                ExecuteSync(db, "INSERT INTO Statuses(Name) VALUES($name)", ("$name", s));
        }
    }

    public static async Task<UserDb?> GetUserByEmail(SqliteConnection db, string email)
    {
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT Id,Name,Email,PasswordHash,Role FROM Users WHERE Email=$email AND Active=1";
        cmd.Parameters.AddWithValue("$email", email);

        await using var r = await cmd.ExecuteReaderAsync();
        if (!await r.ReadAsync()) return null;

        return new UserDb(r.GetInt32(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4));
    }

    public static async Task<List<object>> ListUsers(SqliteConnection db)
    {
        var list = new List<object>();
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT Id,Name,Email,Role,Active FROM Users ORDER BY Name";
        await using var r = await cmd.ExecuteReaderAsync();

        while (await r.ReadAsync())
        {
            list.Add(new { id = r.GetInt32(0), name = r.GetString(1), email = r.GetString(2), role = r.GetString(3), active = r.GetInt32(4) == 1 });
        }

        return list;
    }

    public static async Task<List<object>> ListStatuses(SqliteConnection db)
    {
        var list = new List<object>();
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT Id,Name FROM Statuses ORDER BY Name";
        await using var r = await cmd.ExecuteReaderAsync();

        while (await r.ReadAsync())
            list.Add(new { id = r.GetInt32(0), name = r.GetString(1) });

        return list;
    }

    public static async Task<long> InsertOrder(SqliteConnection db, CreateOrderRequest req, int createdById, string now)
    {
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "INSERT INTO ServiceOrders(CustomerName, CustomerContact, Device, ProblemDescription, EntryCondition, EntryDate, ExpectedExitDate, Status, TechnicianId, CreatedById, CreatedAt, Notes) VALUES($customer,$contact,$device,$problem,$condition,$entry,$exit,$status,$tech,$createdBy,$createdAt,$notes); SELECT last_insert_rowid();";

        AddParams(cmd,
            ("$customer", req.CustomerName),
            ("$contact", req.CustomerContact),
            ("$device", req.Device),
            ("$problem", req.ProblemDescription),
            ("$condition", req.EntryCondition),
            ("$entry", req.EntryDate),
            ("$exit", req.ExpectedExitDate ?? ""),
            ("$status", req.Status),
            ("$tech", req.TechnicianId.HasValue ? req.TechnicianId.Value : DBNull.Value),
            ("$createdBy", createdById),
            ("$createdAt", now),
            ("$notes", req.Notes ?? "")
        );

        return (long)(await cmd.ExecuteScalarAsync() ?? 0L);
    }

    public static async Task UpdateOrder(SqliteConnection db, int id, UpdateOrderRequest req, UserSession session)
    {
        var completedAt = req.Status == "Concluído" || req.Status == "Entregue"
            ? DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
            : null;

        await using var cmd = db.CreateCommand();

        if (session.Role == "Tecnico")
        {
            cmd.CommandText = "UPDATE ServiceOrders SET Status=$status, UpdatedAt=$updated, TechnicalDiagnosis=$diagnosis, ServicePerformed=$performed, Notes=$notes, CompletedAt=COALESCE($completedAt, CompletedAt) WHERE Id=$id;";
            AddParams(cmd,
                ("$status", req.Status),
                ("$updated", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")),
                ("$diagnosis", req.TechnicalDiagnosis ?? ""),
                ("$performed", req.ServicePerformed ?? ""),
                ("$notes", req.Notes ?? ""),
                ("$completedAt", completedAt == null ? DBNull.Value : completedAt),
                ("$id", id));
        }
        else if (session.Role == "Balconista")
        {
            cmd.CommandText = "UPDATE ServiceOrders SET CustomerName=$customer, CustomerContact=$contact, Device=$device, ProblemDescription=$problem, EntryCondition=$condition, EntryDate=$entry, ExpectedExitDate=$exit, Status=$status, TechnicianId=$tech, UpdatedAt=$updated, Notes=$notes, CompletedAt=COALESCE($completedAt, CompletedAt) WHERE Id=$id;";
            AddParams(cmd,
                ("$customer", req.CustomerName),
                ("$contact", req.CustomerContact),
                ("$device", req.Device),
                ("$problem", req.ProblemDescription),
                ("$condition", req.EntryCondition),
                ("$entry", req.EntryDate),
                ("$exit", req.ExpectedExitDate ?? ""),
                ("$status", req.Status),
                ("$tech", req.TechnicianId.HasValue ? req.TechnicianId.Value : DBNull.Value),
                ("$updated", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")),
                ("$notes", req.Notes ?? ""),
                ("$completedAt", completedAt == null ? DBNull.Value : completedAt),
                ("$id", id));
        }
        else
        {
            cmd.CommandText = "UPDATE ServiceOrders SET CustomerName=$customer, CustomerContact=$contact, Device=$device, ProblemDescription=$problem, EntryCondition=$condition, EntryDate=$entry, ExpectedExitDate=$exit, Status=$status, TechnicianId=$tech, UpdatedAt=$updated, TechnicalDiagnosis=$diagnosis, ServicePerformed=$performed, Notes=$notes, CompletedAt=COALESCE($completedAt, CompletedAt) WHERE Id=$id;";
            AddParams(cmd,
                ("$customer", req.CustomerName),
                ("$contact", req.CustomerContact),
                ("$device", req.Device),
                ("$problem", req.ProblemDescription),
                ("$condition", req.EntryCondition),
                ("$entry", req.EntryDate),
                ("$exit", req.ExpectedExitDate ?? ""),
                ("$status", req.Status),
                ("$tech", req.TechnicianId.HasValue ? req.TechnicianId.Value : DBNull.Value),
                ("$updated", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")),
                ("$diagnosis", req.TechnicalDiagnosis ?? ""),
                ("$performed", req.ServicePerformed ?? ""),
                ("$notes", req.Notes ?? ""),
                ("$completedAt", completedAt == null ? DBNull.Value : completedAt),
                ("$id", id));
        }

        await cmd.ExecuteNonQueryAsync();
    }

    public static async Task<List<object>> ListOrders(SqliteConnection db)
    {
        var list = new List<object>();
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT o.Id, o.CustomerName, o.CustomerContact, o.Device, o.ProblemDescription, o.EntryCondition, o.EntryDate, o.ExpectedExitDate, o.Status, o.CreatedAt, o.UpdatedAt, o.TechnicalDiagnosis, o.ServicePerformed, o.Notes, o.CompletedAt, cb.Name as CreatedBy, t.Name as Technician FROM ServiceOrders o LEFT JOIN Users cb ON cb.Id = o.CreatedById LEFT JOIN Users t ON t.Id = o.TechnicianId ORDER BY o.Id DESC;";

        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(ReadOrder(r));

        return list;
    }

    public static async Task<object?> GetOrder(SqliteConnection db, int id)
    {
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT o.Id, o.CustomerName, o.CustomerContact, o.Device, o.ProblemDescription, o.EntryCondition, o.EntryDate, o.ExpectedExitDate, o.Status, o.CreatedAt, o.UpdatedAt, o.TechnicalDiagnosis, o.ServicePerformed, o.Notes, o.CompletedAt, cb.Name as CreatedBy, t.Name as Technician FROM ServiceOrders o LEFT JOIN Users cb ON cb.Id = o.CreatedById LEFT JOIN Users t ON t.Id = o.TechnicianId WHERE o.Id=$id;";
        cmd.Parameters.AddWithValue("$id", id);

        await using var r = await cmd.ExecuteReaderAsync();
        return await r.ReadAsync() ? ReadOrder(r) : null;
    }

    static object ReadOrder(SqliteDataReader r)
    {
        return new
        {
            id = r.GetInt32(0),
            customerName = r.GetString(1),
            customerContact = r.GetString(2),
            device = r.GetString(3),
            problemDescription = r.GetString(4),
            entryCondition = r.GetString(5),
            entryDate = r.GetString(6),
            expectedExitDate = r.IsDBNull(7) ? "" : r.GetString(7),
            status = r.GetString(8),
            createdAt = r.GetString(9),
            updatedAt = r.IsDBNull(10) ? "" : r.GetString(10),
            technicalDiagnosis = r.IsDBNull(11) ? "" : r.GetString(11),
            servicePerformed = r.IsDBNull(12) ? "" : r.GetString(12),
            notes = r.IsDBNull(13) ? "" : r.GetString(13),
            completedAt = r.IsDBNull(14) ? "" : r.GetString(14),
            createdBy = r.IsDBNull(15) ? "" : r.GetString(15),
            technician = r.IsDBNull(16) ? "" : r.GetString(16)
        };
    }

    public static async Task AddLog(SqliteConnection db, long orderId, int userId, string action, string details, string now)
    {
        await Execute(db, "INSERT INTO OrderLogs(OrderId,UserId,Action,Details,CreatedAt) VALUES($order,$user,$action,$details,$created)", ("$order", orderId), ("$user", userId), ("$action", action), ("$details", details), ("$created", now));
    }

    public static async Task<List<object>> ListLogs(SqliteConnection db, int orderId)
    {
        var list = new List<object>();
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT l.Id,u.Name,u.Role,l.Action,l.Details,l.CreatedAt FROM OrderLogs l INNER JOIN Users u ON u.Id = l.UserId WHERE l.OrderId=$id ORDER BY l.Id DESC";
        cmd.Parameters.AddWithValue("$id", orderId);

        await using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            list.Add(new { id = r.GetInt32(0), user = r.GetString(1), role = r.GetString(2), action = r.GetString(3), details = r.GetString(4), createdAt = r.GetString(5) });
        }

        return list;
    }

    public static async Task<object> Reports(SqliteConnection db)
    {
        var today = DateTime.Today;
        var weekStart = today.AddDays(-(int)today.DayOfWeek);
        var monthStart = new DateTime(today.Year, today.Month, 1);

        return new
        {
            today = await CountSince(db, today),
            week = await CountSince(db, weekStart),
            month = await CountSince(db, monthStart),
            byStatus = await CountByStatus(db),
            byTechnician = await CountByTechnician(db)
        };
    }

    static async Task<int> CountSince(SqliteConnection db, DateTime date)
    {
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM ServiceOrders WHERE CreatedAt >= $date";
        cmd.Parameters.AddWithValue("$date", date.ToString("yyyy-MM-dd 00:00:00"));
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    static async Task<List<object>> CountByStatus(SqliteConnection db)
    {
        var list = new List<object>();
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT Status, COUNT(*) FROM ServiceOrders GROUP BY Status ORDER BY COUNT(*) DESC";
        await using var r = await cmd.ExecuteReaderAsync();

        while (await r.ReadAsync())
            list.Add(new { status = r.GetString(0), total = r.GetInt32(1) });

        return list;
    }

    static async Task<List<object>> CountByTechnician(SqliteConnection db)
    {
        var list = new List<object>();
        await using var cmd = db.CreateCommand();
        cmd.CommandText = "SELECT COALESCE(u.Name, 'Sem técnico'), COUNT(*) FROM ServiceOrders o LEFT JOIN Users u ON u.Id = o.TechnicianId GROUP BY u.Name ORDER BY COUNT(*) DESC";
        await using var r = await cmd.ExecuteReaderAsync();

        while (await r.ReadAsync())
            list.Add(new { technician = r.GetString(0), total = r.GetInt32(1) });

        return list;
    }

    public static async Task Execute(SqliteConnection db, string sql, params (string, object)[] parameters)
    {
        await using var cmd = db.CreateCommand();
        cmd.CommandText = sql;
        AddParams(cmd, parameters);
        await cmd.ExecuteNonQueryAsync();
    }

    static void ExecuteSync(SqliteConnection db, string sql, params (string, object)[] parameters)
    {
        using var cmd = db.CreateCommand();
        cmd.CommandText = sql;
        AddParams(cmd, parameters);
        cmd.ExecuteNonQuery();
    }

    static object? Scalar(SqliteConnection db, string sql)
    {
        using var cmd = db.CreateCommand();
        cmd.CommandText = sql;
        return cmd.ExecuteScalar();
    }

    static void AddParams(SqliteCommand cmd, params (string, object)[] parameters)
    {
        foreach (var (name, value) in parameters)
            cmd.Parameters.AddWithValue(name, value);
    }
}

record UserDb(int Id, string Name, string Email, string PasswordHash, string Role);

class PasswordHasher
{
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split('.');
        if (parts.Length != 2) return false;

        var salt = Convert.FromBase64String(parts[0]);
        var expected = Convert.FromBase64String(parts[1]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);

        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}
