import { Aws, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Function, Runtime, Code} from 'aws-cdk-lib/aws-lambda';
import { Vpc, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { CfnTopicRule } from 'aws-cdk-lib/aws-iot';
import { CfnDestination } from 'aws-cdk-lib/aws-iotwireless';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { SecretValue } from 'aws-cdk-lib';
import { PolicyStatement, Role, Effect, ManagedPolicy, ServicePrincipal }
       from 'aws-cdk-lib/aws-iam';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { Parameters } from '../parameters';


export class CdkAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
    //get VPC Info from AWS account, FYI we are not rebuilding we are referencing
    const osipivpc = Vpc.fromVpcAttributes(this, 'osipivpc', {
      vpcId: Parameters.vpc,
      availabilityZones: [Parameters.az[0], Parameters.az[1]],
      privateSubnetIds: [Parameters.privateSubnetId[0], Parameters.privateSubnetId[1]],
    });
    
    // get security group info from the parameter passed.
    const lambdaSecurityGroup = SecurityGroup.fromSecurityGroupId(this, "lambdaSG", 
      Parameters.lambdaSG,
    );
    
    // Generate a IoT Rule name. Things_prefix is specified through our App
    const iot_rule_name = `${Parameters.thing_prefix.replace(/[^a-zA-Z0-9]/g, '')}Rule`
    
    // Create a Secret in AWS Secrets Manager
    const secret = new Secret(this, 'MySecret', {
      secretName: "MySecret",
      secretObjectValue: {
          username: SecretValue.unsafePlainText(Parameters.username), 
          password: SecretValue.unsafePlainText(Parameters.password), 
      },
    });

    // Create IAM Role for Lambda Functions
    const loradecoderlambdaRole = new Role(this, 'loradecoderlambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    
    // Create IAM Role for Lambda Functions
    const osipilambdaRole = new Role(this, 'osipilambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    
    // Attach IAM policy to AWS Lambda Role
    loradecoderlambdaRole.addManagedPolicy(ManagedPolicy.
    fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));
    
    // Attach IAM policy to AWS Lambda Role
    osipilambdaRole.addManagedPolicy(ManagedPolicy.
    fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));
    
    // Attach IAM permissions to OSI PI Lambda to run in VPC
    osipilambdaRole.addToPolicy( new PolicyStatement ({
      actions: [
        "ec2:CreateNetworkInterface",
        "ec2:DeleteNetworkInterface",
        "ec2:DescribeNetworkInterfaces"
      ],
      resources: ['*']
    }))
    
    // Create a Dead Letter Queue
    const dlq = new Queue(this, 'MyDLQ', {
      queueName: 'MyDLQ', 
      retentionPeriod: Duration.days(14), 
    });
    
    // Create Lambda Function that will decode LoRa payload
    const loradecoder = new Function(this, 'loradecoder', {
      runtime: Runtime.NODEJS_16_X,
      handler: 'index.handler',
      code: Code.fromAsset('src/lambda/loradecoder'), 
      role: loradecoderlambdaRole,
      deadLetterQueue: dlq,
    });
    
    // Create Lambda Function that will publish decoded payload to OSIPI Web API
    const osipipublish = new Function(this, 'osipipublish', {
      runtime: Runtime.NODEJS_16_X,
      handler: 'index.handler',
      code: Code.fromAsset('src/lambda/osipipublish'),
      vpc: osipivpc,
      securityGroups: [lambdaSecurityGroup],
      timeout: Duration.seconds(60),
      role: osipilambdaRole,
      deadLetterQueue: dlq,
      environment: {
        SECRET_NAME: secret.secretName, 
      },
    });
    
    // Grant OSI PI Publish Lambda function permissions to access the secret
    secret.grantRead(osipipublish);
    
    
    // Create IAM Role for IoT Topic Rule
    const iotRuleRole = new Role(this, 'IotRuleRole', {
      assumedBy: new ServicePrincipal('iot.amazonaws.com'),
    });
    
    // Attach an IAM policy to the IoT Rule so it can invoke AWS IoT APIs
    iotRuleRole.addManagedPolicy(ManagedPolicy.
    fromAwsManagedPolicyName('AWSIoTFullAccess')); 
    
    // Create IoT Topic Rule
    const iotRule = new CfnTopicRule(this, 'IotTopicRule', {
      ruleName: iot_rule_name,
      topicRulePayload: {
        ruleDisabled: false,
        awsIotSqlVersion: '2016-03-23',
        sql: `
             SELECT aws_lambda("${loradecoder.functionArn}", 
             {"PayloadDecoderName": "${Parameters.decoder}", "PayloadData":PayloadData, 
             "WirelessDeviceId": WirelessDeviceId, "WirelessMetadata": 
             WirelessMetadata}) as transformed_payload, 
             WirelessDeviceId as transformed_payload.WirelessDeviceId, 
             WirelessMetadata.LoRaWAN.DevEui as transformed_payload.DevEui, 
             WirelessDeviceId as lns_payload.WirelessDeviceId, 
             WirelessMetadata as lns_payload.WirelessMetadata, 
             PayloadData as lns_payload.PayloadData, timestamp() as timestamp
             `,
        actions: [
          {
           republish: {
              topic: '/republish/lorawantransformed',
              roleArn: iotRuleRole.roleArn
            }
          },
          {
            lambda: {
              functionArn: osipipublish.functionArn
            }
          }
        ]
      }
    });
    
    // Grant permission to invoke the Lambda function from the IoT Rule
    loradecoder.addPermission('AWS IoT Invocation', {
        principal: new ServicePrincipal('iot.amazonaws.com'),
    });
    
    // Grant permission to invoke the Lambda function from the IoT Rule
    osipipublish.addPermission('AWS IoT Invocation', {
        principal: new ServicePrincipal('iot.amazonaws.com'),
    });
    
    // LoRa Destination IAM Rol To Trigger IoT Rule
    const role_lora_destination= new Role(this, 'RoleLoRaDestination', {
        assumedBy: new ServicePrincipal('iotwireless.amazonaws.com')
    })

    role_lora_destination.addToPolicy(new PolicyStatement({
      resources: ["*"],
      actions: ["iot:DescribeEndpoint"]
    }))
    role_lora_destination.addToPolicy(new PolicyStatement({
        resources: [`arn:aws:iot:${Aws.REGION}:${Aws.ACCOUNT_ID}:topic/$aws/rules/${iotRule.ruleName}`],
        actions: ["iot:Publish"]
    }))
    
    // LoRa Destination
    const lora_destination = new CfnDestination(this, 'LoRaDestination', {
      expression: iot_rule_name,
      expressionType: 'RuleName',
      name: `${iot_rule_name}Destination`,
      roleArn: role_lora_destination.roleArn
    })
  }
}
