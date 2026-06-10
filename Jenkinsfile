// Jenkins pipeline for unified Web, Android, and iOS automation execution.
pipeline {
    agent any

    tools {
        nodejs 'NodeJS'
    }

    parameters {
        choice(name: 'TEST_PLATFORM', choices: ['WEB', 'ANDROID', 'IOS', 'ALL'], description: 'Target platform to execute')
        choice(name: 'ENVIRONMENT', choices: ['qa', 'stage', 'prod'], description: 'Environment configuration')
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
        MOCK_MODE = 'true'
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

        stage('Run Selected Platform') {
            when {
                expression { params.TEST_PLATFORM != 'ALL' }
            }
            steps {
                script {
                    if (params.TEST_PLATFORM == 'WEB') {
                        sh 'npm run test:web'
                    } else if (params.TEST_PLATFORM == 'ANDROID') {
                        sh 'npm run test:android'
                    } else if (params.TEST_PLATFORM == 'IOS') {
                        sh 'npm run test:ios'
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
                        sh 'npm run test:android'
                    }
                }
                stage('iOS') {
                    steps {
                        sh 'npm run test:ios'
                    }
                }
            }
        }

        stage('Generate HTML Report') {
            steps {
                sh 'npm run report || true'
                sh 'npm run allure:generate || true'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'reports/**, allure-results/**, allure-report/**, ai/output/**, ai/memory/**', allowEmptyArchive: true
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/html',
                reportFiles: 'cucumber-html-report.html,cucumber-report.html',
                reportName: 'Cucumber HTML Report'
            ])
            allure includeProperties: false, jdk: '', results: [[path: 'allure-results']]
        }
    }
}
