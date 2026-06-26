// Jenkins pipeline for unified Web, Android, iOS, API Automation, and JMeter Performance testing.
// Includes automated AI Executive Dashboard generation.
pipeline {
    agent any

    tools {
        nodejs 'NodeJS'
    }

    parameters {
        choice(name: 'TEST_PLATFORM', choices: ['WEB', 'ANDROID', 'IOS', 'ALL'], description: 'Target platform to execute')
        choice(name: 'ENVIRONMENT', choices: ['qa', 'stage', 'prod'], description: 'Environment configuration')
        booleanParam(name: 'RUN_PERFORMANCE', defaultValue: false, description: 'Run JMeter performance tests')
        booleanParam(name: 'RUN_AI_ANALYSIS', defaultValue: true, description: 'Run AI analysis on reports')
        booleanParam(name: 'GENERATE_DASHBOARD', defaultValue: true, description: 'Generate AI Executive Dashboard')
        booleanParam(name: 'RUN_API_TESTS', defaultValue: true, description: 'Run API automation tests')
    }

    environment {
        ENV = "${params.ENVIRONMENT}"
        BASE_URL = 'https://www.amazon.in'
        APP_NAME = 'Amazon India'
        BROWSER = 'chromium'
        HEADLESS = 'true'
        PARALLEL = '1'
        RETRIES = '0'
        TIMEOUT = '60000'
        APPIUM_HOST = '127.0.0.1'
        APPIUM_PORT = '4723'
        APPIUM_BASE_PATH = '/'
        APPIUM_AUTO_START = 'true'
        APPIUM_AUTO_STOP = 'true'
        APPIUM_START_TIMEOUT = '30000'
        APPIUM_LOG_PATH = 'mobile/logs/appium-server.log'
        CHROMA_URL = 'http://localhost:8000'
        EMBEDDING_MODEL = 'text-embedding-3-small'
        EMBEDDING_DIMENSIONS = '1536'
        AI_MODEL = 'gpt-4.1-mini'
        OPENAI_API_KEY = credentials('openai-api-key')
        // JMeter Performance thresholds
        THRESHOLD_ERROR_PCT = '5'
        THRESHOLD_RESPONSE_TIME = '5000'
        JMETER_USERS = '10'
        JMETER_RAMPUP = '5'
        JMETER_DURATION = '60'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm install'
                sh 'npx playwright install --with-deps'
                sh 'which jmeter || echo "JMeter not found in PATH — install or set JMETER_HOME"'
            }
        }

        stage('Start And Validate AI Services') {
            steps {
                sh 'npm run vector:start'
                sh 'npm run vector:health'
                sh 'npm run vector:ingest'
            }
        }

        // ──────────────────────────────────────────────
        // Web / Android / iOS — Platform Execution
        // ──────────────────────────────────────────────
        stage('Run Selected Platform') {
            when {
                expression { params.TEST_PLATFORM != 'ALL' }
            }
            steps {
                script {
                    if (params.TEST_PLATFORM == 'WEB') {
                        sh 'npm run test:web'
                    } else if (params.TEST_PLATFORM == 'ANDROID') {
                        sh 'npm run appium:status || true'
                        sh 'npm run appium:start'
                        try {
                            sh 'npm run test:android'
                        } finally {
                            sh 'npm run appium:stop || true'
                        }
                    } else if (params.TEST_PLATFORM == 'IOS') {
                        sh 'npm run appium:status || true'
                        sh 'npm run appium:start'
                        try {
                            sh 'npm run test:ios'
                        } finally {
                            sh 'npm run appium:stop || true'
                        }
                    }
                }
            }
        }

        stage('Run All Platforms') {
            when {
                expression { params.TEST_PLATFORM == 'ALL' }
            }
            parallel {
                stage('Web') {
                    steps {
                        sh 'npm run test:web'
                    }
                }
                stage('Android') {
                    steps {
                        script {
                            sh 'npm run appium:status || true'
                            sh 'npm run appium:start'
                            try {
                                sh 'npm run test:android'
                            } finally {
                                sh 'npm run appium:stop || true'
                            }
                        }
                    }
                }
                stage('iOS') {
                    steps {
                        script {
                            sh 'npm run appium:status || true'
                            sh 'npm run appium:start'
                            try {
                                sh 'npm run test:ios'
                            } finally {
                                sh 'npm run appium:stop || true'
                            }
                        }
                    }
                }
            }
        }

        // ──────────────────────────────────────────────
        // API Tests Stage
        // ──────────────────────────────────────────────
        stage('API Tests') {
            when {
                expression { params.RUN_API_TESTS }
            }
            steps {
                script {
                    try {
                        sh 'npm run test:api'
                        echo "✅ API tests completed — all scenarios executed"
                    } catch (err) {
                        echo "⚠️ API tests completed with failures: ${err}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
            post {
                success {
                    echo "📄 API cucumber report: reports/api/cucumber-report.json"
                    echo "📄 API summary report: reports/api/api-summary.md"
                    echo "📄 API HTML report: reports/api/api-report.html"
                }
            }
        }

        // ──────────────────────────────────────────────
        // API AI Analysis Stage
        // ──────────────────────────────────────────────
        stage('API AI Analysis') {
            when {
                allOf {
                    expression { params.RUN_API_TESTS }
                    expression { params.RUN_AI_ANALYSIS }
                }
            }
            steps {
                script {
                    sh 'npm run ai:api-analysis-agent || echo "⚠️ API AI analysis completed (non-fatal)"'
                    echo "✅ API AI analysis generated: reports/ai/api-analysis-report.md"
                }
            }
            post {
                success {
                    echo "🤖 AI API Analysis Report: reports/ai/api-analysis-report.md"
                }
            }
        }

        // ──────────────────────────────────────────────
        // JMeter Performance Testing Stage
        // ──────────────────────────────────────────────
        stage('JMeter Performance Tests') {
            when {
                expression { params.RUN_PERFORMANCE }
            }
            steps {
                script {
                    try {
                        sh 'npm run perf:jmeter'
                    } catch (err) {
                        echo "JMeter performance tests completed with threshold violations: ${err}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
        }

        // ──────────────────────────────────────────────
        // AI Performance Analysis Stage
        // ──────────────────────────────────────────────
        stage('AI Performance Analysis') {
            when {
                expression { params.RUN_AI_ANALYSIS }
            }
            steps {
                script {
                    sh 'npm run ai:jmeter-analysis || echo "AI analysis completed (non-fatal)"'
                }
            }
        }

        // ──────────────────────────────────────────────
        // Generate HTML Reports Stage
        // ──────────────────────────────────────────────
        stage('Generate HTML Reports') {
            steps {
                sh 'npm run report || true'
                sh 'npm run allure:generate || true'
                echo "JMeter HTML report: reports/jmeter/html/index.html"
                echo "JMeter AI analysis: reports/ai/jmeter-performance-report.md"
                echo "API report: reports/api/api-report.html"
                echo "API AI analysis: reports/ai/api-analysis-report.md"
            }
        }

        // ──────────────────────────────────────────────
        // AI Executive Dashboard Generation Stage
        // ──────────────────────────────────────────────
        stage('Generate AI Executive Dashboard') {
            when {
                expression { params.GENERATE_DASHBOARD }
            }
            steps {
                script {
                    sh 'npm run dashboard:generate'
                    echo "✅ AI Executive Dashboard generated: reports/dashboard/index.html"
                    echo "📊 Dashboard Data: reports/dashboard/dashboard-data.json"
                    echo "📝 Dashboard Summary: reports/dashboard/dashboard-summary.md"
                }
            }
        }
    }

    post {
        unsuccessful {
            script {
                writeFile file: 'logs/jenkins-console.log',
                    text: currentBuild.rawBuild.getLog(10000).join('\n')
            }
            sh 'npm run ai:jenkins-rag -- logs/jenkins-console.log'
        }
        // ──────────────────────────────────────────────
        // API Reports Archive
        // ──────────────────────────────────────────────
        success {
            script {
                // Archive API-specific reports when API tests were run
                if (params.RUN_API_TESTS) {
                    echo "📦 Archiving API reports..."
                    echo "   - reports/api/cucumber-report.json"
                    echo "   - reports/api/api-summary.json"
                    echo "   - reports/api/api-summary.md"
                    echo "   - reports/api/api-report.html"
                    echo "   - reports/ai/api-analysis-report.md"
                }
            }
        }
        cleanup {
            archiveArtifacts artifacts: 'reports/**, allure-results/**, allure-report/**, ai/output/**, ai/memory/**, mobile/logs/**, performance/jmeter/**', allowEmptyArchive: true
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/jmeter/html',
                reportFiles: 'index.html',
                reportName: 'JMeter Performance Report'
            ])
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/html',
                reportFiles: 'cucumber-html-report.html,cucumber-report.html',
                reportName: 'Cucumber HTML Report'
            ])
            // Publish API HTML Report
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/api',
                reportFiles: 'api-report.html',
                reportName: 'API Test Report'
            ])
            // Publish API AI Analysis Report
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/ai',
                reportFiles: 'api-analysis-report.md',
                reportName: 'API AI Analysis Report'
            ])
            // Publish AI Executive Dashboard
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/dashboard',
                reportFiles: 'index.html',
                reportName: 'AI Executive Dashboard'
            ])
            allure includeProperties: false, jdk: '', results: [[path: 'allure-results']]
            sh 'npm run vector:stop || true'
        }
    }
}
