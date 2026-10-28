-- =============================================================================
-- MATRIX FACTORY, DATASHEET & AI TENDER MANAGEMENT SYSTEM
-- Microsoft SQL Server Management Studio (SSMS) Database Schema & Seed Script
-- =============================================================================
-- Instructions for SSMS:
-- 1. Open SQL Server Management Studio (SSMS) and connect to your SQL Server instance.
-- 2. Open this file (database/ssms_schema.sql) and click "Execute" (F5).
-- =============================================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'MatrixFactoryDB')
BEGIN
    CREATE DATABASE [MatrixFactoryDB];
END
GO

USE [MatrixFactoryDB];
GO

-- 1. USERS & ROLE-BASED ACCESS CONTROL (RBAC)
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        FullName NVARCHAR(150) NOT NULL,
        Email NVARCHAR(150) NOT NULL UNIQUE,
        PasswordHash NVARCHAR(255) NOT NULL,
        Role NVARCHAR(50) NOT NULL DEFAULT 'Engineer', -- 'Admin', 'Manager', 'Engineer', 'Viewer'
        Department NVARCHAR(100) NULL,
        CanViewRestrictedContacts BIT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 2. FACTORIES DIRECTORY (What they do, capabilities, certifications)
IF OBJECT_ID('dbo.Factories', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Factories (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(200) NOT NULL,
        Code NVARCHAR(50) NULL,
        Specialization NVARCHAR(500) NOT NULL, -- What they manufacture / do
        Capabilities NVARCHAR(MAX) NULL,       -- Detailed machinery, capacity, product lines
        Certifications NVARCHAR(300) NULL,     -- ISO 9001, UL, CE, SASO, etc.
        Country NVARCHAR(100) NOT NULL,
        City NVARCHAR(100) NULL,
        Address NVARCHAR(500) NULL,
        Website NVARCHAR(250) NULL,
        Rating INT NOT NULL DEFAULT 5,
        Status NVARCHAR(50) NOT NULL DEFAULT 'Active Partner', -- 'Our Factory', 'Active Partner', 'Approved Vendor'
        Notes NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 3. SHARED CONTACTS (With Phone vCard Import/Export & Permission Levels)
IF OBJECT_ID('dbo.Contacts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Contacts (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        FactoryId INT NULL FOREIGN KEY REFERENCES dbo.Factories(Id) ON DELETE SET NULL,
        FullName NVARCHAR(150) NOT NULL,
        JobTitle NVARCHAR(150) NULL,
        Department NVARCHAR(100) NULL,
        CompanyName NVARCHAR(200) NULL,
        Email NVARCHAR(150) NULL,
        Phone NVARCHAR(60) NOT NULL,
        MobilePhone NVARCHAR(60) NULL,
        WhatsApp NVARCHAR(60) NULL,
        VisibilityLevel NVARCHAR(50) NOT NULL DEFAULT 'Public', -- 'Public', 'Restricted', 'AdminOnly'
        Source NVARCHAR(50) NOT NULL DEFAULT 'Manual',          -- 'Manual', 'Phone_vCard_Import', 'CSV_Import'
        Tags NVARCHAR(300) NULL,
        Notes NVARCHAR(MAX) NULL,
        CreatedByUserId INT NULL FOREIGN KEY REFERENCES dbo.Users(Id),
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 4. PRODUCTS & TECHNICAL DATASHEET SPECIFICATIONS
IF OBJECT_ID('dbo.Products', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Products (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        FactoryId INT NULL FOREIGN KEY REFERENCES dbo.Factories(Id) ON DELETE SET NULL,
        SKU NVARCHAR(100) NOT NULL UNIQUE,
        Name NVARCHAR(250) NOT NULL,
        Series NVARCHAR(150) NULL,
        Category NVARCHAR(150) NOT NULL,
        Summary NVARCHAR(1000) NULL,
        SpecificationsJSON NVARCHAR(MAX) NOT NULL, -- Key-value technical specs, electrical/mechanical ratings
        FeaturesJSON NVARCHAR(MAX) NULL,           -- Bullet features for datasheet
        ComplianceStandards NVARCHAR(300) NULL,    -- IEC, IEEE, SASO, ISO standards
        BaseFactoryCost DECIMAL(18,2) NOT NULL DEFAULT 0,
        Currency NVARCHAR(10) NOT NULL DEFAULT 'USD',
        WarrantyMonths INT NOT NULL DEFAULT 24,
        Revision NVARCHAR(20) NOT NULL DEFAULT 'Rev 2.4',
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 5. GENERATED PDF DATASHEETS LOG
IF OBJECT_ID('dbo.Datasheets', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Datasheets (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ProductId INT NOT NULL FOREIGN KEY REFERENCES dbo.Products(Id) ON DELETE CASCADE,
        DocumentCode NVARCHAR(100) NOT NULL,
        Version NVARCHAR(30) NOT NULL,
        TemplateStyle NVARCHAR(50) NOT NULL DEFAULT 'Matrix Standard Industrial',
        CustomProjectName NVARCHAR(200) NULL,
        CustomClientName NVARCHAR(200) NULL,
        GeneratedByUserId INT NULL FOREIGN KEY REFERENCES dbo.Users(Id),
        GeneratedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 6. TENDERS & HISTORICAL TENDER REPOSITORY
IF OBJECT_ID('dbo.Tenders', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Tenders (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ReferenceNumber NVARCHAR(100) NOT NULL,
        Title NVARCHAR(300) NOT NULL,
        ClientName NVARCHAR(200) NOT NULL,
        Country NVARCHAR(100) NOT NULL DEFAULT 'Saudi Arabia',
        FileName NVARCHAR(255) NULL,
        RawDocumentText NVARCHAR(MAX) NULL,
        SubmissionDeadline DATETIME2 NULL,
        Status NVARCHAR(50) NOT NULL DEFAULT 'Analyzing', -- 'Analyzing', 'Priced', 'Submitted', 'Historical_Won', 'Historical_Lost'
        Currency NVARCHAR(10) NOT NULL DEFAULT 'USD',
        TotalEstimatedValue DECIMAL(18,2) NULL,
        WinningCompetitor NVARCHAR(200) NULL,
        WinningBidTotal DECIMAL(18,2) NULL,
        TenderDate DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 7. AI TENDER EXTRACTIONS (Flagged Important vs Not Needed)
IF OBJECT_ID('dbo.TenderExtractions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TenderExtractions (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        TenderId INT NOT NULL FOREIGN KEY REFERENCES dbo.Tenders(Id) ON DELETE CASCADE,
        Category NVARCHAR(100) NOT NULL, -- 'Technical Spec', 'Deadline', 'Penalty / LD', 'Warranty', 'Commercial', 'BoQ'
        RequirementTitle NVARCHAR(250) NOT NULL,
        ExtractedDetail NVARCHAR(MAX) NOT NULL,
        PageReference NVARCHAR(50) NULL,
        AIConfidence INT NOT NULL DEFAULT 92,
        ImportanceFlag NVARCHAR(50) NOT NULL DEFAULT 'Important', -- 'Important', 'Normal', 'NotNeeded'
        UserFeedbackNote NVARCHAR(500) NULL,
        VerifiedByUser BIT NOT NULL DEFAULT 0
    );
END
GO

-- 8. AI LEARNING RULES (Trained from User Flagging Important vs Not Needed)
IF OBJECT_ID('dbo.AIFeedbackRules', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AIFeedbackRules (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        PatternOrTopic NVARCHAR(300) NOT NULL,
        Category NVARCHAR(100) NOT NULL,
        LearnedAction NVARCHAR(50) NOT NULL, -- 'FlagImportant', 'FlagNotNeeded'
        Reason NVARCHAR(500) NULL,
        TimesApplied INT NOT NULL DEFAULT 1,
        CreatedByUserName NVARCHAR(150) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- 9. TENDER LINE ITEMS & HISTORICAL COMPETITOR PRICING
IF OBJECT_ID('dbo.TenderLineItems', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TenderLineItems (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        TenderId INT NOT NULL FOREIGN KEY REFERENCES dbo.Tenders(Id) ON DELETE CASCADE,
        ItemCode NVARCHAR(100) NULL,
        ItemDescription NVARCHAR(300) NOT NULL,
        TechnicalSpecs NVARCHAR(MAX) NOT NULL,
        Quantity DECIMAL(18,2) NOT NULL DEFAULT 1,
        Unit NVARCHAR(30) NOT NULL DEFAULT 'Unit',
        BaseFactoryCost DECIMAL(18,2) NOT NULL DEFAULT 0,
        HistoricalAvgCompetitorPrice DECIMAL(18,2) NULL,
        AIRecommendedAggressivePrice DECIMAL(18,2) NULL,
        AIRecommendedBalancedPrice DECIMAL(18,2) NULL,
        AIRecommendedPremiumPrice DECIMAL(18,2) NULL,
        FinalSelectedUnitPrice DECIMAL(18,2) NULL
    );
END
GO

-- 10. HISTORICAL COMPETITOR BIDS DATABASE
IF OBJECT_ID('dbo.CompetitorPrices', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CompetitorPrices (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        TenderReference NVARCHAR(100) NOT NULL,
        TenderClient NVARCHAR(200) NULL,
        ItemCategory NVARCHAR(150) NOT NULL,
        ItemDescription NVARCHAR(300) NOT NULL,
        NormalizedSpecs NVARCHAR(MAX) NOT NULL,
        CompetitorName NVARCHAR(200) NOT NULL,
        FactoryOrigin NVARCHAR(100) NULL,
        QuotedUnitPrice DECIMAL(18,2) NOT NULL,
        OurQuotedUnitPrice DECIMAL(18,2) NULL,
        Currency NVARCHAR(10) NOT NULL DEFAULT 'USD',
        WasWinningBid BIT NOT NULL DEFAULT 0,
        BidDate DATE NOT NULL
    );
END
GO

-- 11. MARKET FACTORS (Inflation, Shipping, Taxes, Raw Materials for AI Estimator)
IF OBJECT_ID('dbo.MarketFactors', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MarketFactors (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        FactorCode NVARCHAR(100) NOT NULL UNIQUE,
        FactorName NVARCHAR(200) NOT NULL,
        Category NVARCHAR(100) NOT NULL, -- 'Inflation', 'Shipping', 'Tax_Customs', 'Material_Index'
        PercentageRate DECIMAL(8,2) NOT NULL,
        Description NVARCHAR(500) NULL,
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO
