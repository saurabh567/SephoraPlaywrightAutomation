// Jenkins pipeline for running the Playwright Cucumber framework locally or in CI.
pipeline {
    agent any

    tools {
        nodejs 'NodeJS'
    }

    environment {
        ENV = 'dev'
        BASE_URL = 'https://sephora.in'
        BROWSER = 'chromium'
        BROWSERS = 'chromium,firefox,webkit'
        HEADLESS = 'true'
        PARALLEL = '2'
        RETRIES = '0'
        TIMEOUT = '60000'
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
            }
        }

        stage('Run Cucumber Tests') {
            steps {
                sh 'npm run test:ai'
            }
        }

        stage('Generate HTML Report') {
            steps {
                sh 'npm run report'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'reports/**, ai/output/**, ai/memory/**', allowEmptyArchive: true
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/html',
                reportFiles: 'cucumber-html-report.html,cucumber-report.html',
                reportName: 'Cucumber HTML Report'
            ])
        }
    }
}
