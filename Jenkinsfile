pipeline {
    agent any

    tools {
        nodejs 'NodeJS'
    }

    environment {
        ENV = 'dev'
        BROWSER = 'chromium'
        HEADLESS = 'true'
        PARALLEL = '2'
        RETRIES = '1'
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
                sh 'npm test'
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
            archiveArtifacts artifacts: 'reports/**/*, logs/**/*', allowEmptyArchive: true
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
