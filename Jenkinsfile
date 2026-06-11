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

        stage('Start And Validate AI Services') {
            steps {
                sh 'npm run vector:start'
                sh 'npm run vector:health'
                sh 'npm run vector:ingest'
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

        stage('Generate HTML Report') {
            steps {
                sh 'npm run report || true'
                sh 'npm run allure:generate || true'
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
        cleanup {
            archiveArtifacts artifacts: 'reports/**, allure-results/**, allure-report/**, ai/output/**, ai/memory/**, mobile/logs/**', allowEmptyArchive: true
            publishHTML(target: [
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'reports/html',
                reportFiles: 'cucumber-html-report.html,cucumber-report.html',
                reportName: 'Cucumber HTML Report'
            ])
            allure includeProperties: false, jdk: '', results: [[path: 'allure-results']]
            sh 'npm run vector:stop || true'
        }
    }
}
